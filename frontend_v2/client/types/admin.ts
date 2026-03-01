export interface AdminOverview {
  orders_today: number;
  total_orders: number;
  active_alerts: number;
  low_stock_count: number;
  pending_prescriptions: number;
  active_users: number;
}

export interface AdminAlert {
  alert_id: string;
  user_id: string;
  user_name: string;
  medicine_name: string;
  estimated_run_out: string | null;
  confidence: number;
  status: string;
}

export interface InventoryItem {
  inventory_id: string;
  medicine_id: string;
  medicine_name: string;
  stock_quantity: number;
  min_stock_threshold: number;
  unit_type: string;
  status: "ok" | "low" | "critical";
}

export interface AdminOrder {
  order_id: string;
  user_id: string;
  user_name: string;
  order_date: string | null;
  status: string;
  total_amount: number;
  items: any[];
  payment_method: string | null;
}

export interface AdminUser {
  user_id: string;
  name: string;
  email: string;
  phone: string | null;
  age: number | null;
  gender: string | null;
  is_active: boolean;
  last_login_at: string | null;
  created_at: string | null;
  order_count: number;
  alert_count: number;
  avatar_url: string | null;
}

export interface DispensingLog {
  log_id: string;
  order_id: string | null;
  user_id: string;
  user_name: string;
  thread_id: string | null;
  timestamp: string | null;
  medicines_dispensed: any[];
  safety_decision: string | null;
  safety_warnings_surfaced: any[];
  clinical_checks_passed: Record<string, any>;
  counseling_provided: any[];
  pharmacist_escalation_required: boolean;
  trace_id: string | null;
}

export interface PrescriptionQueueItem {
  prescription_id: string;
  user_id: string;
  user_name: string;
  upload_date: string | null;
  expiry_date: string | null;
  extracted_data: Record<string, any>;
  confidence: number;
  image_url: string | null;
}
