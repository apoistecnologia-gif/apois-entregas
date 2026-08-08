import { supabase } from "@/integrations/supabase/client";

export type PixCharge = {
  id: string;
  status: string;
  amount: number;
  qrCodeText: string | null;
  qrCodeImageUrl: string | null;
  expiresAt: string | null;
  providerChargeId: string | null;
};

type PixChargeResponse = {
  payment: PixCharge;
  reused: boolean;
};

type FunctionErrorBody = {
  error?: string;
  code?: string;
};

export class PixPaymentError extends Error {
  readonly code: string | undefined;

  constructor(message: string, code?: string) {
    super(message);
    this.name = "PixPaymentError";
    this.code = code;
  }
}

export async function createPixCharge(orderId: string): Promise<PixChargeResponse> {
  const { data, error } = await supabase.functions.invoke<PixChargeResponse>("create-pix-charge", {
    body: { orderId },
  });

  if (error || !data?.payment) {
    let message = "Não foi possível gerar o PIX agora.";
    let code: string | undefined;
    const context = error?.context;

    if (context instanceof Response) {
      try {
        const body = (await context.clone().json()) as FunctionErrorBody;
        if (body.error) message = body.error;
        code = body.code;
      } catch {
        // Keep the safe fallback message.
      }
    }

    throw new PixPaymentError(message, code);
  }

  return {
    ...data,
    payment: {
      ...data.payment,
      amount: Number(data.payment.amount),
    },
  };
}
