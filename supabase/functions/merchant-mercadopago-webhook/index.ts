import { createClient } from "npm:@supabase/supabase-js@2.112.1";

type Rec=Record<string,unknown>;
const isRec=(v:unknown):v is Rec=>typeof v==="object"&&v!==null&&!Array.isArray(v);
const text=(v:unknown)=>typeof v==="string"&&v.trim()?v.trim():null;
const b64=(v:string)=>Uint8Array.from(atob(v),c=>c.charCodeAt(0));
const response=(status:number,body="ok")=>new Response(body,{status,headers:{"Content-Type":"text/plain; charset=utf-8","Cache-Control":"no-store"}});
async function hmacHex(secret:string,message:string){const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);const sig=await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(message));return [...new Uint8Array(sig)].map(v=>v.toString(16).padStart(2,"0")).join("")}
function equalHex(a:string,b:string){if(a.length!==b.length)return false;let d=0;for(let i=0;i<a.length;i++)d|=a.charCodeAt(i)^b.charCodeAt(i);return d===0}
async function tokenKey(){const raw=Deno.env.get("MERCADO_PAGO_OAUTH_TOKEN_KEY_BASE64")?.trim();if(!raw)throw new Error("missing_token_key");const bytes=b64(raw);if(bytes.byteLength!==32)throw new Error("invalid_token_key");return crypto.subtle.importKey("raw",bytes,"AES-GCM",false,["decrypt"])}
async function decrypt(value:string,iv:string,key:CryptoKey){const clear=await crypto.subtle.decrypt({name:"AES-GCM",iv:b64(iv)},key,b64(value));return new TextDecoder().decode(clear)}

Deno.serve(async(req)=>{
 if(req.method!=="POST")return response(405,"method_not_allowed");
 const secret=Deno.env.get("MERCADO_PAGO_MERCHANT_WEBHOOK_SECRET")?.trim()||Deno.env.get("MERCADO_PAGO_WEBHOOK_SECRET")?.trim();if(!secret)return response(503,"webhook_not_configured");
 const url=new URL(req.url);const payload:unknown=await req.json().catch(()=>({}));const body=isRec(payload)?payload:{};const bodyData=isRec(body.data)?body.data:{};
 const dataId=(text(url.searchParams.get("data.id"))||text(url.searchParams.get("data_id"))||text(bodyData.id)||(bodyData.id!=null?String(bodyData.id):null))?.toLowerCase()??null;
 const requestId=text(req.headers.get("x-request-id"));const signature=text(req.headers.get("x-signature"));if(!dataId||!signature)return response(401,"invalid_signature_input");
 let ts:string|null=null,v1:string|null=null;for(const part of signature.split(",")){const[k,...rest]=part.split("=");const value=rest.join("=").trim();if(k?.trim()==="ts")ts=value;if(k?.trim()==="v1")v1=value}if(!ts||!v1)return response(401,"invalid_signature");
 const tsNum=Number(ts);if(Number.isFinite(tsNum)){const ms=tsNum<1e12?tsNum*1000:tsNum;if(Math.abs(Date.now()-ms)>10*60*1000)return response(401,"stale_signature")}
 let manifest=`id:${dataId};`;if(requestId)manifest+=`request-id:${requestId};`;manifest+=`ts:${ts};`;if(!equalHex(await hmacHex(secret,manifest),v1.toLowerCase()))return response(401,"invalid_signature");
 const supabaseUrl=Deno.env.get("SUPABASE_URL"),serviceRole=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");if(!supabaseUrl||!serviceRole)return response(503,"server_configuration");const admin=createClient(supabaseUrl,serviceRole,{auth:{persistSession:false,autoRefreshToken:false}});
 const eventId=text(body.id)||(body.id!=null?String(body.id):`${dataId}:${ts}`);const providerEventId=`mercadopago_merchant:${eventId}`;
 const existingEvent=await admin.from("payment_events").select("id,status").eq("provider","mercadopago_merchant").eq("provider_event_id",providerEventId).maybeSingle();if(existingEvent.data?.status==="processed")return response(200,"ok");
 // .ilike (não .eq): `dataId` já vem em minúsculas (linha acima), mas o provider_charge_id
 // salvo mantém o casing original emitido pelo Mercado Pago (ex.: "ORDTST01..."), necessário
 // para as chamadas de API em sync-payment-status/process-superapp-refund. ilike sem
 // curingas faz comparação exata case-insensitive, sem afetar os ids numéricos legados.
 const pr=await admin.from("payments").select("id,order_id,amount,status,provider_charge_id,merchant_mercadopago_account_id").eq("provider","mercadopago_merchant").ilike("provider_charge_id",dataId).maybeSingle();const payment=pr.data;if(!payment)return response(202,"unmatched");
 const eventRow=existingEvent.data??(await admin.from("payment_events").insert({provider:"mercadopago_merchant",provider_event_id:providerEventId,event_type:text(body.action)??text(body.type)??"payment",payment_id:payment.id,payload:body,status:"received"}).select("id,status").single()).data;if(!eventRow)return response(500,"event_persistence_failed");
 const ar=await admin.from("merchant_mercadopago_accounts").select("id,status,encrypted_access_token,token_iv").eq("id",payment.merchant_mercadopago_account_id).maybeSingle();const account=ar.data;if(!account||account.status!=="connected"){await admin.from("payment_events").update({status:"failed",error_message:"merchant_account_missing",processed_at:new Date().toISOString()}).eq("id",eventRow.id);return response(500,"merchant_account_missing")}
 let token:string;try{token=await decrypt(account.encrypted_access_token,account.token_iv,await tokenKey())}catch{await admin.from("payment_events").update({status:"failed",error_message:"credential_decrypt_failed",processed_at:new Date().toISOString()}).eq("id",eventRow.id);return response(503,"credential_unavailable")}
 // Compatibilidade dupla: pagamentos criados antes desta migração (estabelecimentos reais,
 // ex. Açaí no Grau) têm provider_charge_id numérico da Payments API legada; pagamentos
 // novos de contas com orders_api_enabled=true têm id da Order (prefixo ORD/ORDTST). O
 // `data.id` notificado pelo Mercado Pago já indica qual é: nunca tentamos adivinhar,
 // apenas seguimos o formato do id que está de fato salvo em payments.provider_charge_id.
 const isOrdersApiId=dataId.startsWith("ord");
 const now=new Date().toISOString();
 let providerAmount:number;let providerExternalRef:string|null;let paid=false;let refunded=false;let failed=false;let raw:Rec;
 if(isOrdersApiId){
   const mp=await fetch(`https://api.mercadopago.com/v1/orders/${encodeURIComponent(dataId)}`,{headers:{Authorization:`Bearer ${token}`,Accept:"application/json"}});const rawRes:unknown=await mp.json().catch(()=>null);if(!mp.ok||!isRec(rawRes)){await admin.from("payment_events").update({status:"failed",error_message:`provider_lookup_${mp.status}`,processed_at:now}).eq("id",eventRow.id);return response(502,"provider_lookup_failed")}
   raw=rawRes;providerAmount=Number(raw.total_amount);providerExternalRef=text(raw.external_reference);
   const status=(text(raw.status)??"unknown").toLowerCase();const statusDetail=(text(raw.status_detail)??"unknown").toLowerCase();
   paid=status==="processed"&&statusDetail==="accredited";refunded=status==="refunded";failed=["canceled","cancelled","expired","failed"].includes(status)||(status==="charged_back"&&statusDetail==="settled");
 }else{
   const mp=await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(dataId)}`,{headers:{Authorization:`Bearer ${token}`,Accept:"application/json"}});const rawRes:unknown=await mp.json().catch(()=>null);if(!mp.ok||!isRec(rawRes)){await admin.from("payment_events").update({status:"failed",error_message:`provider_lookup_${mp.status}`,processed_at:now}).eq("id",eventRow.id);return response(502,"provider_lookup_failed")}
   raw=rawRes;providerAmount=Number(raw.transaction_amount);providerExternalRef=text(raw.external_reference);
   const status=(text(raw.status)??"unknown").toLowerCase();
   paid=status==="approved";refunded=status==="refunded";failed=["cancelled","rejected","charged_back"].includes(status);
 }
 if(!Number.isFinite(providerAmount)||Math.round(providerAmount*100)!==Math.round(Number(payment.amount)*100)||providerExternalRef!==`apois-entregas-order-${payment.order_id}`){await admin.from("payment_events").update({status:"failed",error_message:"provider_payment_mismatch",processed_at:now}).eq("id",eventRow.id);return response(409,"payment_mismatch")}
 if(paid){
   const alreadyPaid=payment.status==="paid";await admin.from("payments").update({status:"paid",paid_at:isOrdersApiId?now:(text(raw.date_approved)??now),failed_at:null,failure_reason:null}).eq("id",payment.id).neq("status","refunded");await admin.from("orders").update({payment_status:"paid"}).eq("id",payment.order_id).neq("status","cancelled").neq("status","refunded");
   if(!alreadyPaid)await admin.from("payment_transactions").upsert({payment_id:payment.id,provider_transaction_id:dataId,transaction_type:"capture",amount:Number(payment.amount),status:"processed",processed_at:now},{onConflict:"payment_id,provider_transaction_id,transaction_type"});
 }else if(refunded){
   await admin.from("payments").update({status:"refunded",failed_at:null,failure_reason:null}).eq("id",payment.id);
   const transitioned=await admin.from("orders").update({payment_status:"refunded",status:"refunded"}).eq("id",payment.order_id).eq("status","cancelled").select("id").maybeSingle();if(!transitioned.data)await admin.from("orders").update({payment_status:"refunded"}).eq("id",payment.order_id);
   const pendingRefund=await admin.from("refunds").select("id,amount,requested_by").eq("payment_id",payment.id).in("status",["pending","processing","failed"]).order("created_at",{ascending:false}).limit(1).maybeSingle();
   if(pendingRefund.data){
     // Orders API: sem lista de refunds separada — o próprio GET acima já é o estado final,
     // então usamos o id da Order como referência. Payments API legada: busca o refund real.
     let providerRefundId=dataId;
     if(!isOrdersApiId){const list=await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(dataId)}/refunds`,{headers:{Authorization:`Bearer ${token}`,Accept:"application/json"}});const refunds:unknown=await list.json().catch(()=>[]);const matched=Array.isArray(refunds)?refunds.find((r:any)=>Math.round(Number(r?.amount)*100)===Math.round(Number(pendingRefund.data.amount)*100)):null;if(matched?.id!=null)providerRefundId=String(matched.id);}
     await admin.from("refunds").update({status:"completed",provider_refund_id:providerRefundId,processed_at:now}).eq("id",pendingRefund.data.id);await admin.from("payment_transactions").upsert({payment_id:payment.id,provider_transaction_id:isOrdersApiId?`${dataId}:refund`:providerRefundId,transaction_type:"refund",amount:Number(pendingRefund.data.amount),status:"completed",processed_at:now},{onConflict:"payment_id,provider_transaction_id,transaction_type"});
   }
 }else if(failed){
   if(payment.status!=="paid"&&payment.status!=="refunded"){await admin.from("payments").update({status:"failed",failed_at:now,failure_reason:`mercadopago_${text(raw.status)??"unknown"}`}).eq("id",payment.id);await admin.from("orders").update({payment_status:"failed"}).eq("id",payment.order_id).neq("status","cancelled").neq("status","refunded");}
 }
 await admin.from("payment_events").update({status:"processed",payload:raw,processed_at:now,error_message:null}).eq("id",eventRow.id);return response(200,"ok");
});
