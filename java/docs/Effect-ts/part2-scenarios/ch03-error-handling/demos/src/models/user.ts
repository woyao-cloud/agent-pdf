export interface User {
  id: string
  name: string
  role: "admin" | "user"
  bannedAt?: Date
  bannedReason?: string
}

export interface Order {
  orderId: string
  userId: string
  amount: number
  status: "pending" | "shipped" | "delivered"
}