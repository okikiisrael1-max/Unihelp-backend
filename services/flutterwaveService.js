import axios from "axios";

export const verifyFlutterwavePayment =
  async (transaction_id) => {
    try {
      const response = await axios.get(
        `https://api.flutterwave.com/v3/transactions/${transaction_id}/verify`,
        {
          headers: {
            Authorization: `Bearer ${process.env.FLW_SECRET_KEY}`,
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