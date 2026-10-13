import { NextResponse } from "next/server";
import { codEnabled, shippingPaise } from "@/lib/shop/config";
import { log } from "@/lib/log";

type Address = { id?: string; zipcode?: string; country?: string };

async function readBody(request: Request) {
  const url = new URL(request.url);
  const fromQuery = {
    order_id: url.searchParams.get("order_id") ?? undefined,
    razorpay_order_id: url.searchParams.get("razorpay_order_id") ?? undefined,
  };
  try {
    const json = (await request.json()) as {
      order_id?: string;
      razorpay_order_id?: string;
      addresses?: Address[];
    };
    return {
      order_id: json.order_id || fromQuery.order_id,
      razorpay_order_id: json.razorpay_order_id || fromQuery.razorpay_order_id,
      addresses: json.addresses ?? [],
    };
  } catch {
    return { ...fromQuery, addresses: [] as Address[] };
  }
}

function shippingResponse(addresses: Address[]) {
  const shippingFee = shippingPaise();
  const allowCod = codEnabled();
  const rows = (addresses.length ? addresses : [{ id: "0", zipcode: "", country: "IN" }]).map(
    (address) => {
      const zip = (address.zipcode ?? "").replace(/\D/g, "");
      const serviceable = zip.length === 0 || /^\d{6}$/.test(zip);
      return {
        id: address.id ?? "0",
        zipcode: address.zipcode ?? "",
        country: address.country || "IN",
        shipping_methods: [
          {
            id: "standard",
            name: "Standard",
            serviceable,
            shipping_fee: shippingFee,
            cod: allowCod && serviceable,
            cod_fee: 0,
          },
        ],
      };
    },
  );
  return { addresses: rows };
}

async function handle(request: Request, method: "get" | "post") {
  const body = await readBody(request);
  log.info("magic-shipping", method, {
    orderId: body.order_id || body.razorpay_order_id,
    addresses: body.addresses.length,
    zips: body.addresses.map((row) => row.zipcode).filter(Boolean),
    codEnabled: codEnabled(),
  });
  return NextResponse.json(shippingResponse(body.addresses));
}

export async function GET(request: Request) {
  return handle(request, "get");
}

export async function POST(request: Request) {
  return handle(request, "post");
}
