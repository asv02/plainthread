export type OrderStatus = "open" | "cancelled";

export type PaymentMethod = "prepaid" | "cod";

export type PaymentStatus =
  | "pending_payment"
  | "paid"
  | "refund_pending"
  | "refunded";

export type ParcelStatus = "pending" | "shipped" | "delivered" | "returned";

export type DbOrder = {
  id: string;
  public_id: string;
  access_token: string;
  idempotency_key: string;
  status: OrderStatus;
  payment_method: PaymentMethod | null;
  parcel_status: ParcelStatus;
  customer_name: string;
  email: string;
  phone: string;
  address_line1: string;
  address_line2: string | null;
  city: string;
  state: string;
  pincode: string;
  subtotal_paise: number;
  tax_paise: number;
  tax_rate_bps: number;
  tax_kind: "igst" | "cgst_sgst";
  cgst_paise: number;
  sgst_paise: number;
  igst_paise: number;
  shipping_paise: number;
  total_paise: number;
  currency: string;
  razorpay_order_id: string | null;
  razorpay_payment_id: string | null;
  payment_status: PaymentStatus;
  failure_reason: string | null;
  hold_expires_at: string;
  cancelled_at: string | null;
  cancel_reason: string | null;
  paid_at: string | null;
  customer_email_sent_at: string | null;
  ops_email_sent_at: string | null;
  user_id: string | null;
  meta_fbp: string | null;
  meta_fbc: string | null;
  meta_client_ip_address: string | null;
  meta_client_user_agent: string | null;
  marketing_consent: boolean | null;
  marketing_consent_at: string | null;
  marketing_consent_source: string | null;
  created_at: string;
  updated_at: string;
};

export type DbOrderItem = {
  id: string;
  order_id: string;
  variant_id: string;
  product_slug: string;
  size: string;
  sku: string;
  name: string;
  qty: number;
  unit_price_paise: number;
  stock_held: boolean;
};

export type OrderPayload = {
  order: DbOrder;
  items: DbOrderItem[];
};

export type CartLine = {
  productSlug: string;
  size: string;
  qty: number;
};

export type AdminOrder = Omit<
  DbOrder,
  | "access_token"
  | "idempotency_key"
  | "meta_fbp"
  | "meta_fbc"
  | "meta_client_ip_address"
  | "meta_client_user_agent"
  | "marketing_consent"
  | "marketing_consent_at"
  | "marketing_consent_source"
> & {
  items: DbOrderItem[];
};

export type PublicOrder = {
  publicId: string;
  status: OrderStatus;
  paymentMethod: PaymentMethod | null;
  paymentStatus: PaymentStatus;
  parcelStatus: ParcelStatus;
  customerName: string;
  email: string;
  phone: string;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  state: string;
  pincode: string;
  subtotalPaise: number;
  taxPaise: number;
  taxRateBps: number;
  taxKind: "igst" | "cgst_sgst";
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  shippingPaise: number;
  totalPaise: number;
  currency: string;
  holdExpiresAt: string | null;
  paidAt: string | null;
  createdAt: string;
  failureReason: string | null;
  items: Array<{
    name: string;
    productSlug: string;
    size: string;
    sku: string;
    qty: number;
    unitPricePaise: number;
  }>;
  canCancel: boolean;
};
