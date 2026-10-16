export function validateCustomer(input: {
  name?: string;
  email?: string;
  phone?: string;
  address_line1?: string;
  address_line2?: string;
  city?: string;
  state?: string;
  pincode?: string;
}) {
  const name = input.name?.trim() ?? "";
  const email = input.email?.trim().toLowerCase() ?? "";
  const phone = (input.phone ?? "").replace(/\s+/g, "");
  const address_line1 = input.address_line1?.trim() ?? "";
  const address_line2 = input.address_line2?.trim() ?? "";
  const city = input.city?.trim() ?? "";
  const state = input.state?.trim() ?? "";
  const pincode = (input.pincode ?? "").trim();

  if (name.length < 2) throw new Error("Enter your name");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Enter a valid email");
  if (!/^[6-9]\d{9}$/.test(phone.replace(/^\+91/, ""))) {
    throw new Error("Enter a valid 10-digit Indian mobile number");
  }
  if (address_line1.length < 6) throw new Error("Enter your address");
  if (city.length < 2) throw new Error("Enter your city");
  if (state.length < 2) throw new Error("Enter your state");
  if (!/^\d{6}$/.test(pincode)) throw new Error("Enter a valid 6-digit PIN code");

  return {
    name,
    email,
    phone: phone.replace(/^\+91/, ""),
    address_line1,
    address_line2,
    city,
    state,
    pincode,
  };
}
