import axios from "axios";

const getFlutterwaveSecretKey = () =>
  process.env.FLW_SECRET_KEY || process.env.FLUTTERWAVE_SECRET_KEY || "";

const getRequiredFlutterwaveSecretKey = () => {
  const key = getFlutterwaveSecretKey();
  if (!key) {
    throw new Error("Flutterwave secret key is not configured");
  }
  return key;
};

export const verifyFlutterwavePayment =
  async (transaction_id) => {
    try {
      const response = await axios.get(
        `https://api.flutterwave.com/v3/transactions/${transaction_id}/verify`,
        {
          headers: {
            Authorization: `Bearer ${getRequiredFlutterwaveSecretKey()}`,
          },
        }
      );

      return response.data;
    } catch (error) {
      console.log(error.response?.data);

      throw new Error(
        "Flutterwave verification failed"
      );
    }
  };

export const initializeFlutterwavePayment = async ({
  txRef,
  amount,
  redirectUrl,
  customer,
  title = "UniHelp Student Premium",
  description = "Student Premium Subscription",
}) => {
  try {
    const response = await axios.post(
      "https://api.flutterwave.com/v3/payments",
      {
        tx_ref: txRef,
        amount,
        currency: "NGN",
        redirect_url: redirectUrl,
        payment_options: "card,banktransfer,ussd",
        customer,
        customizations: {
          title,
          description,
          logo: process.env.APP_LOGO_URL || "",
        },
      },
      {
        headers: {
          Authorization: `Bearer ${getRequiredFlutterwaveSecretKey()}`,
          "Content-Type": "application/json",
        },
      }
    );

    return response.data;
  } catch (error) {
    console.log(error.response?.data || error.message);
    throw new Error("Flutterwave payment initialization failed");
  }
};
