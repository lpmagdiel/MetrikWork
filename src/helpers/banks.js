import banks from "./banks_iban.json";

export const getBankName = (iban) => {
  const normalizedIban = String(iban || "").replace(/\s+/g, "").toUpperCase();
  const bankCode = normalizedIban.substring(4, 8);
  const bank = banks[bankCode] || "Desconocido"; // Devuelve el nombre del banco o "Desconocido" si no se encuentra
  return bank || "";
};
