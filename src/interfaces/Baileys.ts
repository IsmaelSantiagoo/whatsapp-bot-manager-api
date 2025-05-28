export interface BaileysEvent {
  qr?: string;
  type?: any;
  messages?: any[];
  status?: "wa-connected" | "wa-reconnecting" | "wa-disconnected" | "wa-waiting-connection";
  origin: "whatsapp";
}