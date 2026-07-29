export type UserRole = "CUSTOMER" | "ADMIN";
export type BookingStatus = "PENDING_PAYMENT" | "CONFIRMED" | "CANCELLED" | "EXPIRED";
export type SeatStatus = "AVAILABLE" | "HELD" | "BOOKED";
export type PaymentMethod = "UPI" | "CARD" | "WALLET";

export type User = {
  id: string;
  email: string;
  role: UserRole;
  createdAt?: string;
};

export type Movie = {
  id: string;
  title: string;
  description?: string | null;
  durationMin: number;
  rating?: string | null;
  genre?: string;
  language?: string;
  score?: number;
  votes?: string;
  posterTone?: number;
  badge?: string;
};

export type Theater = {
  id: string;
  name: string;
  city: string;
  address: string;
};

export type Screen = {
  id: string;
  name: string;
  theater?: Theater;
};

export type Showtime = {
  id: string;
  movieId: string;
  screenId: string;
  startsAt: string;
  priceCents: number;
  status?: "SCHEDULED" | "CANCELLED";
  movie: Movie;
  screen: Screen & { theater: Theater };
};

export type ShowtimeSeat = {
  id: string;
  rowLabel: string;
  number: number;
  seatType: string;
  status: SeatStatus;
};

export type SeatMap = {
  id: string;
  startsAt: string;
  priceCents: number;
  movie: Movie;
  theater: Theater;
  screen: Screen;
  seats: ShowtimeSeat[];
};

export type BookingSeat = {
  id: string;
  rowLabel: string;
  number: number;
  seatType: string;
  priceCents: number;
};

export type Payment = {
  id: string;
  bookingId: string;
  providerRef: string | null;
  amountCents: number;
  status: "PENDING" | "SUCCEEDED" | "FAILED" | "REFUNDED";
  method: PaymentMethod;
  createdAt?: string;
};

export type Booking = {
  id: string;
  status: BookingStatus;
  totalCents: number;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
  showtime: {
    id: string;
    startsAt: string;
    movie: Movie;
    theater: Theater;
    screen: Screen;
  };
  seats: BookingSeat[];
  payments: Payment[];
};

export type AuthResult = {
  user: User;
  accessToken: string;
};

export type PageResult<T> = {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
};

export type ApiErrorBody = {
  error?: {
    code?: string;
    message?: string;
    details?: unknown;
  };
};
