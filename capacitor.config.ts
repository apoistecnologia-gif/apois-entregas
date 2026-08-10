const variant = String(process.env["APOIS_MOBILE_PRODUCT"] ?? "courier")
  .trim()
  .toLowerCase();

const isCustomer = variant === "customer";

export default {
  appId: isCustomer ? "br.com.apois.cliente" : "br.com.apois.entregador",
  appName: isCustomer ? "APOIS Cliente" : "APOIS Entregador",
  webDir: "dist",
  bundledWebRuntime: false,
  server: {
    androidScheme: "https",
  },
};
