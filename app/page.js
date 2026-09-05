import { redirect } from "next/navigation";

export const metadata = {
  title: "Dhiman Medicos – Order Medicines Online",
  description:
    "Order medicines online from Dhiman Medicos in Binewal, Hoshiarpur, Punjab.",
};

export default function Home() {
  redirect("/online-order");
}
