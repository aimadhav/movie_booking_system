import type {
  ApiErrorBody,
  AuthResult,
  Booking,
  Movie,
  PageResult,
  Payment,
  PaymentMethod,
  SeatMap,
  Showtime,
  User,
} from "./types";

const apiBaseUrl = (process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");

export class CinemaApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
  }
}

const request = async <Result>(
  path: string,
  options: RequestInit & { token?: string; idempotencyKey?: string } = {},
): Promise<Result> => {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 4_500);
  const headers = new Headers(options.headers);
  headers.set("Accept", "application/json");
  if (options.body) headers.set("Content-Type", "application/json");
  if (options.token) headers.set("Authorization", `Bearer ${options.token}`);
  if (options.idempotencyKey) headers.set("Idempotency-Key", options.idempotencyKey);

  try {
    const response = await fetch(`${apiBaseUrl}${path}`, { ...options, headers, signal: controller.signal });
    const body = (await response.json().catch(() => ({}))) as Result & ApiErrorBody;
    if (!response.ok) {
      throw new CinemaApiError(
        body.error?.message ?? `Request failed with status ${response.status}.`,
        response.status,
        body.error?.code ?? "REQUEST_FAILED",
      );
    }
    return body;
  } catch (error) {
    if (error instanceof CinemaApiError) throw error;
    throw new CinemaApiError("The local booking API is unavailable.", 0, "API_UNAVAILABLE");
  } finally {
    window.clearTimeout(timeout);
  }
};

export const cinemaApi = {
  async health() {
    return request<{ status: string }>("/health");
  },

  movies(search = "") {
    const query = new URLSearchParams({ page: "1", pageSize: "50" });
    if (search.trim()) query.set("search", search.trim());
    return request<PageResult<Movie>>(`/movies?${query}`);
  },

  showtimes(movieId?: string) {
    const query = new URLSearchParams({ page: "1", pageSize: "100", city: "Bengaluru" });
    if (movieId) query.set("movieId", movieId);
    return request<PageResult<Showtime>>(`/showtimes?${query}`);
  },

  seatMap(showtimeId: string) {
    return request<SeatMap>(`/showtimes/${showtimeId}/seats`);
  },

  login(email: string, password: string) {
    return request<AuthResult>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
  },

  register(email: string, password: string) {
    return request<AuthResult>("/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
  },

  session(token: string) {
    return request<User>("/auth/me", { token });
  },

  bookings(token: string) {
    return request<{ items: Booking[] }>("/bookings/me", { token });
  },

  reserve(token: string, showtimeId: string, seatIds: string[], idempotencyKey = crypto.randomUUID()) {
    return request<Booking>("/bookings/reserve", {
      method: "POST",
      token,
      idempotencyKey,
      body: JSON.stringify({ showtimeId, seatIds }),
    });
  },

  confirm(token: string, bookingId: string) {
    return request<Payment>(`/bookings/${bookingId}/confirm`, {
      method: "POST",
      token,
      idempotencyKey: crypto.randomUUID(),
    });
  },

  processMockPayment(
    token: string,
    bookingId: string,
    paymentMethod: PaymentMethod,
    outcome: "SUCCEEDED" | "FAILED",
  ) {
    return request<Payment>("/payments/mock/process", {
      method: "POST",
      token,
      idempotencyKey: crypto.randomUUID(),
      body: JSON.stringify({ bookingId, method: paymentMethod, outcome }),
    });
  },

  cancel(token: string, bookingId: string) {
    return request<Booking>(`/bookings/${bookingId}/cancel`, { method: "POST", token });
  },

  createMovie(
    token: string,
    input: { title: string; description: string; durationMin: number; rating: string },
  ) {
    return request<Movie>("/admin/movies", { method: "POST", token, body: JSON.stringify(input) });
  },

  createTheater(token: string, input: { name: string; city: string; address: string }) {
    return request<{ id: string; name: string; city: string; address: string }>("/admin/theaters", {
      method: "POST",
      token,
      body: JSON.stringify(input),
    });
  },

  createScreen(token: string, input: { theaterId: string; name: string }) {
    return request<{ id: string; name: string; theaterId: string }>("/admin/screens", {
      method: "POST",
      token,
      body: JSON.stringify(input),
    });
  },

  addSeats(token: string, screenId: string, rows: number, seatsPerRow: number) {
    const seats = Array.from({ length: rows }, (_, rowIndex) =>
      Array.from({ length: seatsPerRow }, (_, seatIndex) => ({
        rowLabel: String.fromCharCode(65 + rowIndex),
        number: seatIndex + 1,
        seatType: rowIndex === rows - 1 ? "PREMIUM" : "STANDARD",
      })),
    ).flat();
    return request<Array<{ id: string }>>(`/admin/screens/${screenId}/seats`, {
      method: "POST",
      token,
      body: JSON.stringify({ seats }),
    });
  },

  createShowtime(
    token: string,
    input: { movieId: string; screenId: string; startsAt: string; priceCents: number },
  ) {
    return request<Showtime>("/admin/showtimes", {
      method: "POST",
      token,
      body: JSON.stringify(input),
    });
  },
};
