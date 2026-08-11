const LABELS: Record<string, string> = {
  IMPORTED: "Imported",
  UPDATED: "Details updated",
  MSG_SENT: "Message sent",
  MSG_DELIVERED: "Message delivered",
  MSG_READ: "Message read",
  MSG_FAILED: "Message failed",
  LINK_CLICKED: "Link clicked",
  REPLIED: "Replied",
  PAYMENT_RECEIVED: "Payment received",
  ORDER_PLACED: "Order placed",
  OPTED_OUT: "Opted out",
  CUSTOM: "Custom event",
};

const DOT_CLASSES: Record<string, string> = {
  MSG_FAILED: "bg-red-500",
  OPTED_OUT: "bg-red-500",
  REPLIED: "bg-green-500",
  PAYMENT_RECEIVED: "bg-green-500",
  MSG_READ: "bg-green-500",
  LINK_CLICKED: "bg-amber-500",
  ORDER_PLACED: "bg-amber-500",
};

export function eventLabel(type: string) {
  return LABELS[type] ?? type;
}

export function eventDotClass(type: string) {
  return DOT_CLASSES[type] ?? "bg-stone-400";
}
