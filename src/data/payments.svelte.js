export const plans = [
  {
    name: "Plan S",
    title: "STANDARD",
    price: "$3.99",
    amount: 399,
    billing: "Facturado anualmente $47.88",
    description: "Equipos de máximo 3 personas",
    features: ["Hasta 3 miembros", "Mensajes en el chat maximo 90 días"],
    color: "#FF8A50",
    gradient: "linear-gradient(135deg, #FF8A50, #FFAB91)",
    icon: 0,
    recommended: false,
    stripeLink: "https://buy.stripe.com/test_5kQ6oHeSE9zY8BU8bv8EM01"
  },
  {
    name: "Plan M",
    title: "ALL ACCESS",
    price: "$7.50",
    amount: 750,
    billing: "Facturado anualmente $90.00",
    description: "Equipos de máximo 8 personas",
    features: ["Hasta 8 miembros", "Mensajes en el chat ilimitados"],
    color: "#FFD54F",
    gradient: "linear-gradient(135deg, #FFC107, #FFE082)",
    icon: 1,
    recommended: true,
    stripeLink: "https://buy.stripe.com/test_5kQ6oHeSE9zY8BU8bv8EM01"
  },
  {
    name: "Plan L",
    title: "PREMIUM",
    price: "$13.99",
    amount: 1399,
    billing: "Facturado anualmente $167.88",
    description: "Equipos de máximo 15 personas",
    features: ["Hasta 15 miembros","Mensajes en el chat ilimitados", "Informes avanzados"],
    color: "#5C6BC0",
    gradient: "linear-gradient(135deg, #3F51B5, #7986CB)",
    icon: 2,
    recommended: false,
    stripeLink: "https://buy.stripe.com/test_5kQ6oHeSE9zY8BU8bv8EM01"
  },
  {
    name: "Plan XL",
    title: "UNLIMITED",
    price: "$25",
    amount: 2500,
    billing: "Facturado anualmente $300.00",
    description: "Equipos sin límite de miembros",
    features: ["Miembros ilimitados", "Todo incluido"],
    color: "#9575CD",
    gradient: "linear-gradient(135deg, #673AB7, #9575CD)",
    icon: 3,
    recommended: false,
    stripeLink: "https://buy.stripe.com/test_5kQ6oHeSE9zY8BU8bv8EM01"
  },
];

class PaymentStore {
  selectedPlanName = $state("Plan M");
  clientSecret = $state(null);
  paymentStatus = $state("idle"); // idle | loading | success | error
  paymentError = $state(null);
  paymentResult = $state(null);

  get selectedPlan() {
    return plans.find(p => p.name === this.selectedPlanName);
  }

  selectPlan(name) {
    this.selectedPlanName = name;
  }

  async createPaymentIntent() {
    const plan = this.selectedPlan;
    if (!plan) throw new Error("No plan selected");

    this.paymentStatus = "loading";
    this.paymentError = null;

    try {
      const response = await fetch("/api/create-payment-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: plan.amount,
          currency: "usd",
          planName: plan.name,
        }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Error creating payment intent");
      }

      const { clientSecret } = await response.json();
      this.clientSecret = clientSecret;
      return clientSecret;
    } catch (error) {
      this.paymentStatus = "error";
      this.paymentError = error.message;
      throw error;
    }
  }

  setPaymentResult(result) {
    this.paymentResult = result;
    this.paymentStatus = "success";
  }

  reset() {
    this.clientSecret = null;
    this.paymentStatus = "idle";
    this.paymentError = null;
    this.paymentResult = null;
  }
}

export const paymentStore = new PaymentStore();
