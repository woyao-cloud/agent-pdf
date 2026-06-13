export interface User {
  id: string;
  name: string;
  email: string;
}

export interface Order {
  id: string;
  userId: string;
  amount: number;
  status: 'pending' | 'shipped' | 'delivered';
}

export interface AggregatedUserResponse {
  user: User;
  orders: Order[];
  orderCount: number;
  totalAmount: number;
}