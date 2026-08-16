import { createClient } from "npm:@supabase/supabase-js@2.112.1";

type JsonRecord = Record<string, unknown>;
type Device = { id: string; platform: string; token: string; appProduct?: string };
type ClaimedPush = { outbox_id:string; notification_id:string; user_id:string; title:string; body:string; data:JsonRecord|null; notification_type:string; attempt_count:number; devices:Device[] };

const FCM_SCOPE="https://www.googleapis.com/auth/firebase.messaging";
const OAUTH_TOKEN_URL="https://oauth2.googleapis.com/token";
const COURIER_PACKAGE="br.com.apois.entregador";
const CUSTOMER_PACKAGE="br.com.apois.cliente";
const env=(n:string)=>Deno.env.get(n)?.trim()??"";
const response=(s:number,b:JsonRecord)=>new Response(JSON.stringify(b),{status:s,headers:{"Content-Type":"application/json"}});
function b64u(bytes:Uint8Array){let x="";for(const b of bytes)x+=String.fromCharCode(b);return btoa(x).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"")}
const b64t=(v:string)=>b64u(new TextEncoder().encode(v));
function pkcs8(v:string){const n=v.replace(/\\n/g,"\n").replace("-----BEGIN PRIVATE KEY-----","").replace("-----END PRIVATE KEY-----","").replace(/\s+/g,"");if(!n)throw new Error("FIREBASE_PRIVATE_KEY is invalid");return Uint8Array.from(atob(n),c=>c.charCodeAt(0));}
async function accessToken(email:string,key:string){const now=Math.floor(Date.now()/1000);const h=b64t(JSON.stringify({alg:"RS256",typ:"JWT"}));const p=b64t(JSON.stringify({iss:email,scope:FCM_SCOPE,aud:OAUTH_TOKEN_URL,iat:now,exp:now+3600}));const u=`${h}.${p}`;const k=await crypto.subtle.importKey("pkcs8",pkcs8(key),{name:"RSASSA-PKCS1-v1_5",hash:"SHA-256"},false,["sign"]);const sig=await crypto.subtle.sign("RSASSA-PKCS1-v1_5",k,new TextEncoder().encode(u));const assertion=`${u}.${b64u(new Uint8Array(sig))}`;const r=await fetch(OAUTH_TOKEN_URL,{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({grant_type:"urn:ietf:params:oauth:grant-type:jwt-bearer",assertion})});const j=await r.json().catch(()=>({})) as Record<string,unknown>;if(!r.ok||typeof j.access_token!=="string"){const code=typeof j.error==="string"?j.error:"oauth_error";const desc=typeof j.error_description==="string"?j.error_description:"no_description";throw new Error(`Firebase OAuth failed (${r.status}) ${code}: ${desc}`)}return j.access_token;}
function dataStrings(v:JsonRecord|null,id:string,t:string){const o:Record<string,string>={notificationId:id,notificationType:t};for(const [k,x] of Object.entries(v??{})){if(x!=null)o[k]=typeof x==="string"?x:JSON.stringify(x)}return o}
function retryAt(a:number){const m=a<=1?1:a===2?5:a===3?15:60;return new Date(Date.now()+m*60000).toISOString()}

Deno.serve(async(req)=>{
 if(req.method!=="POST")return response(405,{error:"method_not_allowed"});
 const url=env("SUPABASE_URL"), service=env("SUPABASE_SERVICE_ROLE_KEY");
 if(!url||!service)return response(503,{error:"supabase_server_credentials_not_configured"});
 const sb=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
 const supplied=req.headers.get("x-apois-push-dispatch-key")?.trim()??"";
 const {data:valid,error:verifyError}=await sb.rpc("verify_push_dispatch_key",{_candidate:supplied});
 if(verifyError)return response(500,{error:"dispatch_key_verification_failed",detail:verifyError.message});
 if(valid!==true)return response(401,{error:"invalid_dispatch_key"});
 const project=env("FIREBASE_PROJECT_ID"), email=env("FIREBASE_CLIENT_EMAIL"), key=Deno.env.get("FIREBASE_PRIVATE_KEY")??"";
 if(!project||!email||!key)return response(503,{error:"firebase_server_credentials_not_configured",missing:{project:!project,email:!email,privateKey:!key}});
 const {data:claimed,error:claimError}=await sb.rpc("claim_notification_push_batch_v2",{_limit:25});
 if(claimError)return response(500,{error:"push_claim_failed",detail:claimError.message});
 const pushes=Array.isArray(claimed)?claimed as ClaimedPush[]:[];
 if(!pushes.length)return response(200,{processed:0,sent:0,failed:0});
 let token="";try{token=await accessToken(email,key)}catch(e){const msg=e instanceof Error?e.message:"Firebase OAuth failed";for(const p of pushes)await sb.from("notification_push_outbox").update({status:"failed",last_error:msg,next_attempt_at:retryAt(p.attempt_count),updated_at:new Date().toISOString()}).eq("id",p.outbox_id);return response(502,{error:"firebase_oauth_failed",detail:msg})}
 let sent=0,failed=0,discarded=0;
 for(const p of pushes){const devices=(p.devices??[]).filter(d=>d.platform==="android"&&d.token?.trim()&&(d.appProduct==="customer"||d.appProduct==="courier"));if(!devices.length){await sb.from("notification_push_outbox").update({status:"discarded",last_error:"no_active_android_device",processed_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq("id",p.outbox_id);discarded++;continue}
 let ok=0;const errs:string[]=[];
 for(const d of devices){const courier=d.appProduct==="courier";const r=await fetch(`https://fcm.googleapis.com/v1/projects/${encodeURIComponent(project)}/messages:send`,{method:"POST",headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},body:JSON.stringify({message:{token:d.token,notification:{title:p.title,body:p.body},data:dataStrings(p.data,p.notification_id,p.notification_type),android:{priority:courier&&p.notification_type==="delivery_offer"?"high":"normal",ttl:courier?"90s":"3600s",restricted_package_name:courier?COURIER_PACKAGE:CUSTOMER_PACKAGE,notification:{channel_id:courier?"delivery_offers":"order_updates",default_sound:true,default_vibrate_timings:true,notification_priority:courier?"PRIORITY_MAX":"PRIORITY_HIGH",visibility:"PUBLIC"}}}})});if(r.ok)ok++;else{const j=await r.text();errs.push(`FCM ${r.status} ${j.slice(0,300)}`)}}
 if(ok>0){await sb.from("notification_push_outbox").update({status:"sent",last_error:errs.length?errs.join("; ").slice(0,1000):null,processed_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq("id",p.outbox_id);sent++}else{await sb.from("notification_push_outbox").update({status:"failed",last_error:errs.join("; ").slice(0,1000)||"fcm_send_failed",next_attempt_at:retryAt(p.attempt_count),updated_at:new Date().toISOString()}).eq("id",p.outbox_id);failed++}}
 return response(200,{processed:pushes.length,sent,failed,discarded});
});