export interface QuoteLine {
  medicine_id: string;
  name: string;
  requested_qty: number;
  requested_unit: string;
  strip_size: number;
  billing_qty: number;
  billing_unit: string;
  unit_price: number;
  subtotal: number;
  // Enriched medicine metadata
  generic_name?: string;
  salt?: string;
  dosage?: string;
  category?: string;
  manufacturer?: string;
  prescription_required?: boolean;
  active_ingredients?: Array<{
    molecule: string;
    strength_mg?: number;
    strength_unit?: string;
  }>;
  counseling_info?: {
    food_timing?: string;
    food_note?: string;
    drowsiness?: boolean;
    drowsiness_note?: string;
    alcohol_warning?: boolean;
    alcohol_note?: string;
    storage?: string;
    common_side_effects?: string[];
    missed_dose_action?: string;
    is_antibiotic?: boolean;
    course_completion_critical?: boolean;
  };
  in_stock?: boolean;
  stock_quantity?: number;
}

export interface QuotePayload {
  currency: string;
  display_unit: string;
  total_amount: number;
  conversion_note?: string;
  quantity_status: "resolved" | "range_needs_choice" | "missing";
  quantity_options: number[];
  lines: QuoteLine[];
}

export interface PaymentPayload {
  order_id: string;
  razorpay_order_id: string;
  amount: number;
  currency: string;
  key_id: string;
  items: any[];
}

export interface DBMatch {
  medicine_id: string;
  name: string;
  generic_name: string;
  price: number;
  rx_required: boolean;
  in_stock: boolean;
  relevance_score: number;
  match_quality: "exact" | "strength_mismatch" | "partial" | "therapeutic" | "none";
  match_warnings?: string[];
  strength_note?: string;
}

export interface PrescriptionMedicine {
  name: string;
  dosage?: string;
  frequency?: string;
  duration?: string;
  db_matches?: DBMatch[];
}

export interface PrescriptionMeta {
  prescription_id?: string;
  medicines?: PrescriptionMedicine[];
  advice?: string[];
  valid_until?: string;
  doctor_name?: string;
  confidence?: number;
}

export type MessageAction =
  | "chat"
  | "recommend"
  | "confirm_order"
  | "execute_order"
  | "reject"
  | "clarify"
  | "negotiate"
  | "proceed"
  | "request_payment"
  | "request_prescription_upload"
  | "delivery_confirmed";

export interface MedicineRecommendation {
  name: string;
  generic_name?: string;
  price?: number;
  category?: string;
  dosage?: string;
  prescription_required?: boolean;
}

export interface UiPayload {
  type: "recommendations" | "order_summary" | "payment" | "prescription_required" | "prescription_upload" | "delivery_status" | "waitlist_subscribed" | "cart_summary" | "none";
  data: Record<string, any>;
}

export interface Message {
  id: string | number;
  role: "user" | "assistant";
  content: string | React.ReactNode;
  isNew?: boolean;
  // Rich data from backend ChatResponse
  action?: MessageAction;
  quote?: QuotePayload;
  payment?: PaymentPayload;
  prescription?: PrescriptionMeta;
  recommendations?: MedicineRecommendation[];
  uiPayload?: UiPayload;
  turnSeq?: number;
  // Post-payment delivery tracking
  deliveryStatus?: "confirmed" | "preparing" | "dispatched" | "arriving";
  orderId?: string;
  // Payment card state
  paymentStatus?: "pending" | "processing" | "success" | "failed";
}
