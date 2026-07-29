"use client";

import { useEffect, useMemo, useState } from "react";

import { cinemaApi, CinemaApiError } from "./api";
import { demoMovies, makeDemoBooking, makeDemoSeatMap, makeDemoShowtimes } from "./demo-data";
import type {
  Booking,
  Movie,
  Payment,
  PaymentMethod,
  SeatMap,
  Showtime,
  ShowtimeSeat,
  User,
} from "./types";

type View = "home" | "showtimes" | "seats" | "checkout" | "bookings" | "admin";
type DataMode = "checking" | "live" | "demo";
type AuthMode = "login" | "register";
type PaymentStage = "ready" | "processing" | "failed" | "succeeded";
type MockPaymentOutcome = "SUCCEEDED" | "FAILED";

const SESSION_KEY = "cineloop-session";

const money = (cents: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(cents / 100);

const shortDate = (value: string) =>
  new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short" }).format(new Date(value));

const longDate = (value: string) =>
  new Intl.DateTimeFormat("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(value));

const time = (value: string) =>
  new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit" }).format(new Date(value));

const enrichMovie = (movie: Movie, index: number): Movie => {
  const fallback = demoMovies[index % demoMovies.length];
  return {
    ...fallback,
    ...movie,
    genre: movie.genre ?? fallback.genre,
    language: movie.language ?? fallback.language,
    score: movie.score ?? fallback.score,
    votes: movie.votes ?? fallback.votes,
    posterTone: movie.posterTone ?? fallback.posterTone,
    badge: movie.badge ?? fallback.badge,
  };
};

const getErrorMessage = (error: unknown) =>
  error instanceof CinemaApiError ? error.message : "Something unexpected happened. Please try again.";

const countdownLabel = (expiresAt: string | null, now: number) => {
  if (!expiresAt) return "Paid";
  const remaining = Math.max(0, new Date(expiresAt).getTime() - now);
  const minutes = Math.floor(remaining / 60_000);
  const seconds = Math.floor((remaining % 60_000) / 1_000);
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
};

export function CinemaApp() {
  const [view, setView] = useState<View>("home");
  const [mode, setMode] = useState<DataMode>("checking");
  const [movies, setMovies] = useState<Movie[]>(demoMovies);
  const [selectedMovie, setSelectedMovie] = useState<Movie>(demoMovies[0]);
  const [showtimes, setShowtimes] = useState<Showtime[]>(makeDemoShowtimes(demoMovies[0]));
  const [liveShowtimeIds, setLiveShowtimeIds] = useState<string[]>([]);
  const [selectedShowtime, setSelectedShowtime] = useState<Showtime | null>(null);
  const [seatMap, setSeatMap] = useState<SeatMap | null>(null);
  const [selectedSeatIds, setSelectedSeatIds] = useState<string[]>([]);
  const [activeBooking, setActiveBooking] = useState<Booking | null>(null);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState("");
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [authEmail, setAuthEmail] = useState("admin@cinema.local");
  const [authPassword, setAuthPassword] = useState("ChangeMe123!");
  const [authBusy, setAuthBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [now, setNow] = useState(Date.now());
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("UPI");
  const [paymentStage, setPaymentStage] = useState<PaymentStage>("ready");
  const [mockPaymentOutcome, setMockPaymentOutcome] = useState<MockPaymentOutcome>("SUCCEEDED");
  const [paymentReceipt, setPaymentReceipt] = useState<Payment | null>(null);
  const [adminMessage, setAdminMessage] = useState("");
  const [concurrencyResults, setConcurrencyResults] = useState<Array<{ label: string; state: string; detail: string }>>([]);
  const [concurrencyBusy, setConcurrencyBusy] = useState(false);
  const [movieForm, setMovieForm] = useState({
    title: "Midnight Protocol",
    description: "A systems engineer discovers a message hidden inside the city traffic network.",
    durationMin: 124,
    rating: "UA 13+",
  });
  const tomorrow = useMemo(() => {
    const date = new Date(Date.now() + 86_400_000);
    date.setHours(18, 30, 0, 0);
    const offset = date.getTimezoneOffset() * 60_000;
    return new Date(date.getTime() - offset).toISOString().slice(0, 16);
  }, []);
  const [venueForm, setVenueForm] = useState({
    theaterName: "CineLoop Central",
    city: "Bengaluru",
    address: "100 Residency Road",
    screenName: "Audi 1",
    rows: 5,
    seatsPerRow: 10,
    startsAt: tomorrow,
    priceRupees: 349,
  });

  useEffect(() => {
    const stored = window.localStorage.getItem(SESSION_KEY);
    if (stored) {
      try {
        const session = JSON.parse(stored) as { user: User; token: string };
        setUser(session.user);
        setToken(session.token);
      } catch {
        window.localStorage.removeItem(SESSION_KEY);
      }
    }

    const detectApi = async () => {
      try {
        await cinemaApi.health();
        const result = await cinemaApi.movies();
        const liveMovies = result.items.map(enrichMovie);
        const titles = new Set(liveMovies.map((movie) => movie.title));
        setMovies([...liveMovies, ...demoMovies.filter((movie) => !titles.has(movie.title))]);
        if (liveMovies[0]) {
          setSelectedMovie(liveMovies[0]);
          const liveShows = await cinemaApi.showtimes(liveMovies[0].id);
          if (liveShows.items.length > 0) {
            const enrichedShows = liveShows.items.map((item) => ({ ...item, movie: enrichMovie(item.movie, 0) }));
            setShowtimes(enrichedShows);
            setLiveShowtimeIds(enrichedShows.map((item) => item.id));
          }
        }
        setMode("live");
      } catch {
        setMode("demo");
      }
    };
    void detectApi();
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 3_600);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const visibleMovies = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return movies;
    return movies.filter((movie) =>
      [movie.title, movie.genre, movie.language].some((value) => value?.toLowerCase().includes(query)),
    );
  }, [movies, search]);

  const selectedSeats = useMemo(
    () => seatMap?.seats.filter((seat) => selectedSeatIds.includes(seat.id)) ?? [],
    [seatMap, selectedSeatIds],
  );

  const isLiveFlow = selectedShowtime ? mode === "live" && liveShowtimeIds.includes(selectedShowtime.id) : false;
  const usesLiveBookingApi = (booking: Booking) => mode === "live" && !booking.id.startsWith("BK");

  const resetMockPayment = () => {
    setPaymentMethod("UPI");
    setPaymentStage("ready");
    setMockPaymentOutcome("SUCCEEDED");
    setPaymentReceipt(null);
  };

  const openCheckout = (booking: Booking) => {
    setActiveBooking(booking);
    resetMockPayment();
    setView("checkout");
  };

  const saveSession = (nextUser: User, nextToken: string) => {
    setUser(nextUser);
    setToken(nextToken);
    window.localStorage.setItem(SESSION_KEY, JSON.stringify({ user: nextUser, token: nextToken }));
  };

  const signOut = () => {
    setUser(null);
    setToken("");
    setBookings([]);
    window.localStorage.removeItem(SESSION_KEY);
    setNotice("You have been signed out.");
  };

  const openMovie = async (movie: Movie) => {
    setSelectedMovie(movie);
    setBusy(true);
    setView("showtimes");
    try {
      if (mode === "live") {
        const result = await cinemaApi.showtimes(movie.id);
        if (result.items.length > 0) {
          const liveItems = result.items.map((item) => ({ ...item, movie: enrichMovie(item.movie, 0) }));
          setShowtimes(liveItems);
          setLiveShowtimeIds(liveItems.map((item) => item.id));
          return;
        }
      }
      setShowtimes(makeDemoShowtimes(movie));
      setLiveShowtimeIds([]);
    } catch {
      setShowtimes(makeDemoShowtimes(movie));
      setLiveShowtimeIds([]);
    } finally {
      setBusy(false);
    }
  };

  const openSeats = async (showtime: Showtime) => {
    setSelectedShowtime(showtime);
    setSelectedSeatIds([]);
    setBusy(true);
    setView("seats");
    try {
      if (mode === "live" && liveShowtimeIds.includes(showtime.id)) {
        setSeatMap(await cinemaApi.seatMap(showtime.id));
      } else {
        setSeatMap(makeDemoSeatMap(showtime));
      }
    } catch (error) {
      setNotice(getErrorMessage(error));
      setSeatMap(makeDemoSeatMap(showtime));
    } finally {
      setBusy(false);
    }
  };

  const toggleSeat = (seat: ShowtimeSeat) => {
    if (seat.status !== "AVAILABLE") return;
    setSelectedSeatIds((current) => {
      if (current.includes(seat.id)) return current.filter((id) => id !== seat.id);
      if (current.length >= 10) {
        setNotice("You can reserve up to 10 seats in one booking.");
        return current;
      }
      return [...current, seat.id];
    });
  };

  const reserveSeats = async () => {
    if (!selectedShowtime || selectedSeats.length === 0) return;
    if (!user || !token) {
      setAuthOpen(true);
      setNotice("Sign in to hold your selected seats.");
      return;
    }

    setBusy(true);
    try {
      const booking = isLiveFlow
        ? await cinemaApi.reserve(token, selectedShowtime.id, selectedSeats.map((seat) => seat.id))
        : makeDemoBooking(selectedShowtime, selectedSeats);
      setActiveBooking(booking);
      resetMockPayment();
      setBookings((current) => [booking, ...current.filter((item) => item.id !== booking.id)]);
      setView("checkout");
      setNotice(`Seats held for ${countdownLabel(booking.expiresAt, Date.now())} minutes.`);
    } catch (error) {
      setNotice(getErrorMessage(error));
      if (isLiveFlow) {
        try {
          setSeatMap(await cinemaApi.seatMap(selectedShowtime.id));
          setSelectedSeatIds([]);
        } catch {
          // The original reservation error is the useful message.
        }
      }
    } finally {
      setBusy(false);
    }
  };

  const confirmPayment = async () => {
    if (!activeBooking || !user || !token) return;
    if (activeBooking.expiresAt && new Date(activeBooking.expiresAt).getTime() <= Date.now()) {
      setPaymentStage("failed");
      setNotice("This seat hold has expired. Please choose the seats again.");
      return;
    }

    setBusy(true);
    setPaymentStage("processing");
    try {
      const livePayment = usesLiveBookingApi(activeBooking);
      const payment = livePayment
        ? await cinemaApi.processMockPayment(token, activeBooking.id, paymentMethod, mockPaymentOutcome)
        : {
            id: `PAY${Math.random().toString(36).slice(2, 9).toUpperCase()}`,
            providerRef: `mockpay_${Date.now()}`,
            bookingId: activeBooking.id,
            amountCents: activeBooking.totalCents,
            status: mockPaymentOutcome,
            method: paymentMethod,
            createdAt: new Date().toISOString(),
          };

      if (payment.status === "FAILED") {
        const pending: Booking = {
          ...activeBooking,
          updatedAt: new Date().toISOString(),
          payments: [...activeBooking.payments, payment],
        };
        setActiveBooking(pending);
        setBookings((current) => [pending, ...current.filter((item) => item.id !== pending.id)]);
        setPaymentReceipt(payment);
        setPaymentStage("failed");
        setNotice("Mock gateway declined the payment. Your seats remain held while the timer is active.");
        return;
      }

      const confirmed: Booking = {
        ...activeBooking,
        status: "CONFIRMED",
        expiresAt: null,
        updatedAt: new Date().toISOString(),
        payments: [...activeBooking.payments, payment],
      };

      let persistedBooking = confirmed;
      if (livePayment) {
        try {
          const result = await cinemaApi.bookings(token);
          persistedBooking = result.items.find((booking) => booking.id === activeBooking.id) ?? confirmed;
          setBookings(result.items);
        } catch {
          setBookings((current) => [confirmed, ...current.filter((item) => item.id !== confirmed.id)]);
        }
      } else {
        setBookings((current) => [confirmed, ...current.filter((item) => item.id !== confirmed.id)]);
      }

      setActiveBooking(persistedBooking);
      setPaymentReceipt(payment);
      setPaymentStage("succeeded");
      setNotice("Payment succeeded. The booking and seats are now confirmed.");
    } catch (error) {
      setPaymentStage("failed");
      setNotice(getErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const loadBookings = async () => {
    setView("bookings");
    if (!user || !token) return;
    if (mode !== "live") return;
    try {
      const result = await cinemaApi.bookings(token);
      setBookings(result.items);
    } catch (error) {
      setNotice(getErrorMessage(error));
    }
  };

  const cancelBooking = async (booking: Booking) => {
    if (!user || !token) return;
    setBusy(true);
    try {
      const cancelled =
        usesLiveBookingApi(booking)
          ? await cinemaApi.cancel(token, booking.id)
          : { ...booking, status: "CANCELLED" as const, expiresAt: null, updatedAt: new Date().toISOString() };
      setBookings((current) => current.map((item) => (item.id === booking.id ? cancelled : item)));
      setNotice("Booking cancelled and seats released.");
    } catch (error) {
      setNotice(getErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const submitAuth = async (event: React.FormEvent) => {
    event.preventDefault();
    setAuthBusy(true);
    try {
      if (mode === "live") {
        const result =
          authMode === "login"
            ? await cinemaApi.login(authEmail, authPassword)
            : await cinemaApi.register(authEmail, authPassword);
        saveSession(result.user, result.accessToken);
      } else {
        const role = authEmail.toLowerCase().includes("admin") ? "ADMIN" : "CUSTOMER";
        saveSession(
          { id: crypto.randomUUID(), email: authEmail, role, createdAt: new Date().toISOString() },
          `demo-${crypto.randomUUID()}`,
        );
      }
      setAuthOpen(false);
      setNotice(authMode === "login" ? "Welcome back to CineLoop." : "Your CineLoop account is ready.");
    } catch (error) {
      setNotice(getErrorMessage(error));
    } finally {
      setAuthBusy(false);
    }
  };

  const createMovie = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!user || user.role !== "ADMIN" || !token) {
      setAuthOpen(true);
      setNotice("Use the seeded admin account to access live admin commands.");
      return;
    }
    setBusy(true);
    setAdminMessage("");
    try {
      const created =
        mode === "live"
          ? await cinemaApi.createMovie(token, movieForm)
          : {
              id: crypto.randomUUID(),
              ...movieForm,
              posterTone: ((movies.length + 1) % 5) + 1,
              genre: "Thriller · Technology",
              language: "English",
              score: 8.8,
              votes: "Preview",
              badge: "JUST ADDED",
            };
      const enriched = enrichMovie(created, movies.length);
      setMovies((current) => [enriched, ...current]);
      setAdminMessage(`${created.title} was added to the catalogue.`);
    } catch (error) {
      setAdminMessage(getErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const setupVenue = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!user || user.role !== "ADMIN" || !token) {
      setAuthOpen(true);
      setNotice("Sign in as the seeded admin to run the live setup workflow.");
      return;
    }
    setBusy(true);
    setAdminMessage("");
    try {
      if (mode === "live") {
        const liveCatalogue = await cinemaApi.movies();
        const movie = liveCatalogue.items[0];
        if (!movie) throw new Error("Create a movie before setting up a showtime.");
        const theater = await cinemaApi.createTheater(token, {
          name: venueForm.theaterName,
          city: venueForm.city,
          address: venueForm.address,
        });
        const screen = await cinemaApi.createScreen(token, { theaterId: theater.id, name: venueForm.screenName });
        await cinemaApi.addSeats(token, screen.id, venueForm.rows, venueForm.seatsPerRow);
        await cinemaApi.createShowtime(token, {
          movieId: movie.id,
          screenId: screen.id,
          startsAt: new Date(venueForm.startsAt).toISOString(),
          priceCents: venueForm.priceRupees * 100,
        });
      }
      setAdminMessage(
        `${venueForm.theaterName} / ${venueForm.screenName} is ready with ${venueForm.rows * venueForm.seatsPerRow} seats and a scheduled showtime.`,
      );
    } catch (error) {
      setAdminMessage(getErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const runConcurrencyDemo = async () => {
    if (!user || !token) {
      setAuthOpen(true);
      setNotice("Sign in first so both competing requests have an owner.");
      return;
    }
    setConcurrencyBusy(true);
    setConcurrencyResults([
      { label: "Request A", state: "running", detail: "Waiting for row lock…" },
      { label: "Request B", state: "running", detail: "Waiting for row lock…" },
    ]);

    try {
      let targetShowtime = showtimes[0] ?? makeDemoShowtimes(selectedMovie)[0];
      let targetSeat: ShowtimeSeat;
      const useLive = mode === "live" && liveShowtimeIds.includes(targetShowtime.id);
      if (useLive) {
        const currentMap = await cinemaApi.seatMap(targetShowtime.id);
        const available = currentMap.seats.find((seat) => seat.status === "AVAILABLE");
        if (!available) throw new Error("No available seat remains for the concurrency demo.");
        targetSeat = available;
      } else {
        targetShowtime = makeDemoShowtimes(selectedMovie)[0];
        targetSeat = makeDemoSeatMap(targetShowtime).seats.find((seat) => seat.status === "AVAILABLE")!;
      }

      if (useLive) {
        const results = await Promise.allSettled([
          cinemaApi.reserve(token, targetShowtime.id, [targetSeat.id], `race-a-${crypto.randomUUID()}`),
          cinemaApi.reserve(token, targetShowtime.id, [targetSeat.id], `race-b-${crypto.randomUUID()}`),
        ]);
        setConcurrencyResults(
          results.map((result, index) =>
            result.status === "fulfilled"
              ? {
                  label: `Request ${index === 0 ? "A" : "B"}`,
                  state: "won",
                  detail: `201 Created · seat ${targetSeat.rowLabel}${targetSeat.number} held`,
                }
              : {
                  label: `Request ${index === 0 ? "A" : "B"}`,
                  state: "lost",
                  detail: "409 Conflict · SEAT_UNAVAILABLE",
                },
          ),
        );
      } else {
        await new Promise((resolve) => window.setTimeout(resolve, 850));
        setConcurrencyResults([
          { label: "Request A", state: "won", detail: `201 Created · seat ${targetSeat.rowLabel}${targetSeat.number} held` },
          { label: "Request B", state: "lost", detail: "409 Conflict · SEAT_UNAVAILABLE" },
        ]);
      }
    } catch (error) {
      setConcurrencyResults([{ label: "Demo", state: "lost", detail: getErrorMessage(error) }]);
    } finally {
      setConcurrencyBusy(false);
    }
  };

  const renderHome = () => (
    <>
      <section className="hero">
        <div className="hero-orbit hero-orbit-one" />
        <div className="hero-orbit hero-orbit-two" />
        <div className="hero-copy">
          <div className="eyebrow">CINELOOP PREMIERE</div>
          <h1>Big stories.<br />Zero booking drama.</h1>
          <p>
            Discover films, pick your perfect seats, and watch a concurrency-safe booking engine work behind every click.
          </p>
          <div className="hero-actions">
            <button className="button button-primary" onClick={() => openMovie(movies[0])}>Book a movie</button>
            <button className="button button-ghost" onClick={() => setView("admin")}>Open system lab</button>
          </div>
          <div className="hero-proof">
            <span><strong>10 min</strong> protected holds</span>
            <span><strong>1 winner</strong> per seat</span>
            <span><strong>Atomic</strong> payment state</span>
          </div>
        </div>
        <div className="hero-ticket" aria-label="Featured film ticket">
          <div className="ticket-glow" />
          <span className="ticket-kicker">NOW SHOWING</span>
          <strong>The Last<br />Orbit</strong>
          <div className="ticket-meta"><span>SCI-FI</span><span>128 MIN</span><span>UA 13+</span></div>
          <div className="ticket-code">CL / 07 / 42</div>
        </div>
      </section>

      <section className="content-section" id="movies">
        <div className="section-heading">
          <div>
            <span className="section-kicker">CURATED FOR BENGALURU</span>
            <h2>Recommended movies</h2>
          </div>
          <span className="section-count">{visibleMovies.length} films</span>
        </div>
        <div className="movie-grid">
          {visibleMovies.map((movie, index) => (
            <article className="movie-card" key={movie.id}>
              <button className="movie-poster-button" onClick={() => openMovie(movie)} aria-label={`View showtimes for ${movie.title}`}>
                <div className={`poster-art poster-tone-${movie.posterTone ?? (index % 5) + 1}`}>
                  <span className="poster-badge">{movie.badge}</span>
                  <div className="poster-mark">{String(index + 1).padStart(2, "0")}</div>
                  <div className="poster-title">{movie.title}</div>
                  <div className="poster-credit">A CINELOOP ORIGINAL</div>
                </div>
                <div className="rating-ribbon">
                  <span>★ {movie.score}</span>
                  <span>{movie.votes} votes</span>
                </div>
              </button>
              <div className="movie-card-copy">
                <h3>{movie.title}</h3>
                <p>{movie.genre}</p>
                <span>{movie.language} · {movie.durationMin} min</span>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="premiere-strip">
        <div className="premiere-copy">
          <span className="section-kicker light">CINELOOP SPOTLIGHT</span>
          <h2>Stories worth leaving home for.</h2>
          <p>Hand-picked premieres with reserved recliners, quieter screens, and a booking flow engineered for peak traffic.</p>
        </div>
        <div className="premiere-numbers">
          <div><strong>32</strong><span>seat states created per seeded showtime</span></div>
          <div><strong>3×</strong><span>automatic serializable transaction retries</span></div>
          <div><strong>0</strong><span>double bookings under concurrent requests</span></div>
        </div>
      </section>

      <section className="content-section">
        <div className="section-heading">
          <div>
            <span className="section-kicker">BEYOND THE SCREEN</span>
            <h2>The best of live entertainment</h2>
          </div>
        </div>
        <div className="experience-grid">
          <button className="experience-card experience-comedy" onClick={() => setNotice("Live events are a visual preview in this system-design build.")}>
            <span>WEEKEND PICK</span><strong>Stand-up<br />after dark</strong><small>12 events</small>
          </button>
          <button className="experience-card experience-music" onClick={() => setNotice("Live events are a visual preview in this system-design build.")}>
            <span>LIVE & LOUD</span><strong>Indie nights<br />in Bengaluru</strong><small>8 events</small>
          </button>
          <button className="experience-card experience-kids" onClick={() => setNotice("Live events are a visual preview in this system-design build.")}>
            <span>FAMILY DAY</span><strong>Stories for<br />little dreamers</strong><small>15 events</small>
          </button>
        </div>
      </section>
    </>
  );

  const groupedShowtimes = useMemo(() => {
    const groups = new Map<string, Showtime[]>();
    showtimes.forEach((showtime) => {
      const key = showtime.screen.theater.id;
      groups.set(key, [...(groups.get(key) ?? []), showtime]);
    });
    return [...groups.values()];
  }, [showtimes]);

  const renderShowtimes = () => (
    <section className="flow-page">
      <button className="back-link" onClick={() => setView("home")}>← Back to movies</button>
      <div className="movie-detail-header">
        <div className={`mini-poster poster-tone-${selectedMovie.posterTone ?? 1}`}>
          <span>{selectedMovie.title}</span>
        </div>
        <div>
          <span className="section-kicker">NOW BOOKING</span>
          <h1>{selectedMovie.title}</h1>
          <div className="detail-pills">
            <span>★ {selectedMovie.score}</span>
            <span>{selectedMovie.rating}</span>
            <span>{selectedMovie.language}</span>
            <span>{selectedMovie.genre}</span>
            <span>{selectedMovie.durationMin} min</span>
          </div>
          <p>{selectedMovie.description}</p>
        </div>
      </div>

      <div className="date-scroller">
        {[1, 2, 3, 4, 5].map((day, index) => {
          const date = new Date(Date.now() + day * 86_400_000);
          return (
            <button className={index === 0 ? "date-pill active" : "date-pill"} key={day}>
              <span>{new Intl.DateTimeFormat("en-IN", { weekday: "short" }).format(date)}</span>
              <strong>{date.getDate()}</strong>
              <small>{new Intl.DateTimeFormat("en-IN", { month: "short" }).format(date)}</small>
            </button>
          );
        })}
      </div>

      <div className="showtime-panel">
        <div className="showtime-info-bar">
          <span><i className="availability-dot" /> Available</span>
          <span>Cancellation available</span>
          <span>Prices in INR</span>
        </div>
        {busy ? (
          <div className="loading-block">Finding the best screens…</div>
        ) : groupedShowtimes.length === 0 ? (
          <div className="empty-state"><strong>No shows yet</strong><span>Try another date or movie.</span></div>
        ) : (
          groupedShowtimes.map((items) => {
            const theater = items[0].screen.theater;
            return (
              <article className="theater-row" key={theater.id}>
                <div className="theater-copy">
                  <div className="theater-title"><span>♡</span><strong>{theater.name}</strong></div>
                  <p>{theater.address}</p>
                  <div><span className="amenity">M-Ticket</span><span className="amenity food">Food & Beverage</span></div>
                </div>
                <div className="time-list">
                  {items.map((showtime) => (
                    <button key={showtime.id} className="time-button" onClick={() => openSeats(showtime)}>
                      <strong>{time(showtime.startsAt)}</strong>
                      <span>{showtime.screen.name}</span>
                      <small>{money(showtime.priceCents)}</small>
                    </button>
                  ))}
                </div>
              </article>
            );
          })
        )}
      </div>
    </section>
  );

  const seatRows = useMemo(() => {
    const rows = new Map<string, ShowtimeSeat[]>();
    seatMap?.seats.forEach((seat) => rows.set(seat.rowLabel, [...(rows.get(seat.rowLabel) ?? []), seat]));
    return [...rows.entries()];
  }, [seatMap]);

  const renderSeats = () => (
    <section className="seat-page">
      <div className="seat-topbar">
        <button className="back-link compact" onClick={() => setView("showtimes")}>←</button>
        <div>
          <strong>{seatMap?.movie.title ?? selectedMovie.title}</strong>
          <span>{seatMap ? `${seatMap.theater.name} · ${shortDate(seatMap.startsAt)} · ${time(seatMap.startsAt)}` : "Loading seat map…"}</span>
        </div>
        <div className="seat-count-chip">{selectedSeatIds.length || 0} seats</div>
      </div>
      <div className="seat-workspace">
        <div className="seat-legend">
          <span><i className="seat-swatch available" />Available</span>
          <span><i className="seat-swatch selected" />Selected</span>
          <span><i className="seat-swatch held" />Held</span>
          <span><i className="seat-swatch booked" />Booked</span>
        </div>
        <div className="seat-category"><span>STANDARD & PREMIUM</span><span>{seatMap ? money(seatMap.priceCents) : "—"}</span></div>
        <div className="seat-grid" aria-label="Cinema seat map">
          {busy || !seatMap ? (
            <div className="loading-block">Loading live seat inventory…</div>
          ) : (
            seatRows.map(([row, seats]) => (
              <div className="seat-row" key={row}>
                <span className="row-label">{row}</span>
                <div className="row-seats">
                  {seats.map((seat, index) => (
                    <button
                      key={seat.id}
                      className={`seat seat-${seat.status.toLowerCase()} ${selectedSeatIds.includes(seat.id) ? "seat-selected" : ""} ${index === 4 ? "aisle-after" : ""}`}
                      disabled={seat.status !== "AVAILABLE"}
                      onClick={() => toggleSeat(seat)}
                      aria-label={`${seat.rowLabel}${seat.number}, ${seat.status.toLowerCase()}`}
                    >
                      {seat.number}
                    </button>
                  ))}
                </div>
                <span className="row-label right">{row}</span>
              </div>
            ))
          )}
        </div>
        <div className="screen-wrap">
          <div className="screen-arc" />
          <span>ALL EYES THIS WAY PLEASE</span>
        </div>
      </div>
      <div className="seat-checkout-bar">
        <div>
          <span>{selectedSeats.length ? selectedSeats.map((seat) => `${seat.rowLabel}${seat.number}`).join(", ") : "Select up to 10 seats"}</span>
          <strong>{seatMap ? money(seatMap.priceCents * selectedSeats.length) : "—"}</strong>
        </div>
        <button className="button button-primary wide" disabled={!selectedSeats.length || busy} onClick={reserveSeats}>
          {busy ? "Locking seats…" : selectedSeats.length ? `Hold ${selectedSeats.length} seat${selectedSeats.length > 1 ? "s" : ""}` : "Choose seats"}
        </button>
      </div>
    </section>
  );

  const renderCheckout = () => {
    if (!activeBooking) return null;
    const fee = Math.round(activeBooking.totalCents * 0.047);
    const holdExpired = Boolean(
      activeBooking.expiresAt && new Date(activeBooking.expiresAt).getTime() <= now,
    );

    if (paymentStage === "succeeded" && paymentReceipt) {
      return (
        <section className="checkout-page payment-success-page">
          <div className="payment-success-card">
            <div className="success-check" aria-hidden="true">✓</div>
            <span className="section-kicker">MOCK GATEWAY APPROVED</span>
            <h1>Your ticket is confirmed.</h1>
            <p>
              Payment, booking, and seat inventory were committed as one protected operation.
              This ticket is now available in My Bookings.
            </p>
            <div className="success-state-flow" aria-label="Completed booking states">
              <div><span>PAYMENT</span><strong>SUCCEEDED</strong></div>
              <i>→</i>
              <div><span>BOOKING</span><strong>CONFIRMED</strong></div>
              <i>→</i>
              <div><span>SEATS</span><strong>BOOKED</strong></div>
            </div>
            <div className="success-receipt">
              <div><span>Movie</span><strong>{activeBooking.showtime.movie.title}</strong></div>
              <div><span>Seats</span><strong>{activeBooking.seats.map((seat) => `${seat.rowLabel}${seat.number}`).join(", ")}</strong></div>
              <div><span>Paid using</span><strong>{paymentReceipt.method}</strong></div>
              <div><span>Amount</span><strong>{money(paymentReceipt.amountCents)}</strong></div>
              <div><span>Booking ID</span><strong>{activeBooking.id.toUpperCase()}</strong></div>
              <div><span>Gateway reference</span><strong>{paymentReceipt.providerRef ?? paymentReceipt.id}</strong></div>
            </div>
            <div className="success-actions">
              <button className="button button-primary" onClick={() => void loadBookings()}>
                View ticket in My Bookings
              </button>
              <button className="button button-ghost" onClick={() => setView("home")}>Book another movie</button>
            </div>
          </div>
        </section>
      );
    }

    return (
      <section className="checkout-page">
        <div className="checkout-heading">
          <button className="back-link" onClick={() => setView(selectedShowtime ? "seats" : "bookings")}>
            ← {selectedShowtime ? "Review seats" : "My bookings"}
          </button>
          <div>
            <span className="section-kicker">SECURE CHECKOUT</span>
            <h1>Complete your booking</h1>
          </div>
          <div className={`hold-clock ${holdExpired ? "expired" : ""}`}>
            <span>{holdExpired ? "Hold status" : "Seats held for"}</span>
            <strong>{countdownLabel(activeBooking.expiresAt, now)}</strong>
          </div>
        </div>
        <div className="checkout-grid">
          <div className="checkout-main">
            <div className="checkout-card booking-summary-card">
              <div className={`checkout-poster poster-tone-${activeBooking.showtime.movie.posterTone ?? 1}`}>
                <span>{activeBooking.showtime.movie.title}</span>
              </div>
              <div>
                <span className="ticket-status">PENDING PAYMENT</span>
                <h2>{activeBooking.showtime.movie.title}</h2>
                <p>{longDate(activeBooking.showtime.startsAt)} · {time(activeBooking.showtime.startsAt)}</p>
                <p>{activeBooking.showtime.theater.name}, {activeBooking.showtime.theater.city}</p>
                <div className="seat-tags">
                  {activeBooking.seats.map((seat) => <span key={seat.id}>{seat.rowLabel}{seat.number}</span>)}
                </div>
              </div>
            </div>
            <div className="checkout-card trust-card">
              <strong>Why your seats are safe</strong>
              <p>The database changed these exact showtime-seat rows from AVAILABLE to HELD inside one serializable transaction. No other booking can claim them during the countdown.</p>
              <div className="transaction-steps">
                <span className="done">1 <small>Rows locked</small></span>
                <i />
                <span className="done">2 <small>Hold created</small></span>
                <i />
                <span className={paymentStage === "processing" ? "active" : ""}>3 <small>Payment</small></span>
              </div>
            </div>
            <div className="checkout-card mock-gateway-card">
              <div className="gateway-heading">
                <div>
                  <span className="section-kicker">CINELOOP PAY LAB</span>
                  <h3>Choose a mock payment method</h3>
                </div>
                <span className="sandbox-badge">SANDBOX</span>
              </div>
              <div className="payment-methods" role="group" aria-label="Mock payment method">
                {([
                  ["UPI", "UPI", "demo@cineloop"],
                  ["CARD", "Card", "Visa ending 4242"],
                  ["WALLET", "Wallet", "CineLoop balance"],
                ] as const).map(([value, label, detail]) => (
                  <button
                    type="button"
                    key={value}
                    className={paymentMethod === value ? "payment-method active" : "payment-method"}
                    aria-pressed={paymentMethod === value}
                    disabled={busy}
                    onClick={() => setPaymentMethod(value)}
                  >
                    <span>{label}</span>
                    <small>{detail}</small>
                  </button>
                ))}
              </div>
              <div className="mock-instrument">
                <div className={`instrument-icon instrument-${paymentMethod.toLowerCase()}`}>
                  {paymentMethod === "UPI" ? "UPI" : paymentMethod === "CARD" ? "4242" : "CL"}
                </div>
                <div>
                  <span>{paymentMethod === "UPI" ? "Demo UPI address" : paymentMethod === "CARD" ? "Tokenized test card" : "Mock wallet account"}</span>
                  <strong>{paymentMethod === "UPI" ? "demo@cineloop" : paymentMethod === "CARD" ? "•••• •••• •••• 4242" : "CineLoop Wallet · ₹5,000"}</strong>
                </div>
                <small>No real financial details</small>
              </div>
              <div className="outcome-lab">
                <div>
                  <strong>Gateway response</strong>
                  <span>Use failure once to demonstrate retry behavior.</span>
                </div>
                <div className="outcome-options" role="group" aria-label="Mock gateway response">
                  <button
                    type="button"
                    className={mockPaymentOutcome === "SUCCEEDED" ? "active success" : ""}
                    aria-pressed={mockPaymentOutcome === "SUCCEEDED"}
                    disabled={busy}
                    onClick={() => setMockPaymentOutcome("SUCCEEDED")}
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    className={mockPaymentOutcome === "FAILED" ? "active failure" : ""}
                    aria-pressed={mockPaymentOutcome === "FAILED"}
                    disabled={busy}
                    onClick={() => setMockPaymentOutcome("FAILED")}
                  >
                    Decline
                  </button>
                </div>
              </div>
              {paymentStage === "failed" && (
                <div className="payment-failure" role="status">
                  <strong>{holdExpired ? "Seat hold expired" : "Payment declined safely"}</strong>
                  <span>
                    {holdExpired
                      ? "No charge was created. Return to the seat map and start a fresh hold."
                      : "The booking is still PENDING_PAYMENT and the seats remain HELD. Select Approve to retry with a new idempotency key."}
                  </span>
                </div>
              )}
            </div>
          </div>
          <aside className="price-card">
            <span className="section-kicker">PRICE DETAILS</span>
            <h3>Order summary</h3>
            <div className="price-row"><span>Tickets ({activeBooking.seats.length})</span><strong>{money(activeBooking.totalCents)}</strong></div>
            <div className="price-row"><span>Booking fee</span><strong>{money(fee)}</strong></div>
            <div className="price-row discount"><span>CineLoop welcome offer</span><strong>−{money(fee)}</strong></div>
            <div className="price-divider" />
            <div className="price-row total"><span>Amount payable</span><strong>{money(activeBooking.totalCents)}</strong></div>
            <div className="gateway-summary">
              <span>Method</span><strong>{paymentMethod}</strong>
              <span>Test response</span><strong className={mockPaymentOutcome === "SUCCEEDED" ? "approve" : "decline"}>{mockPaymentOutcome}</strong>
            </div>
            <button className="button button-primary payment-button" disabled={busy || holdExpired} onClick={confirmPayment}>
              {busy ? "Gateway processing…" : holdExpired ? "Seat hold expired" : `Pay ${money(activeBooking.totalCents)}`}
            </button>
            <p className="payment-note">
              Mock payment only. No money is moved and no card, UPI, or wallet credentials are collected.
            </p>
          </aside>
        </div>
      </section>
    );
  };

  const renderBookings = () => (
    <section className="flow-page booking-page">
      <div className="section-heading">
        <div>
          <span className="section-kicker">YOUR CINELOOP</span>
          <h1>Bookings & tickets</h1>
        </div>
        {user && <span className="user-caption">{user.email}</span>}
      </div>
      {!user ? (
        <div className="empty-state large">
          <div className="empty-ticket">CL</div>
          <strong>Your tickets will live here</strong>
          <span>Sign in to view bookings, complete pending payments, or cancel eligible tickets.</span>
          <button className="button button-primary" onClick={() => setAuthOpen(true)}>Sign in</button>
        </div>
      ) : bookings.length === 0 ? (
        <div className="empty-state large">
          <div className="empty-ticket">00</div>
          <strong>No bookings yet</strong>
          <span>Your first big-screen story is only a few clicks away.</span>
          <button className="button button-primary" onClick={() => setView("home")}>Explore movies</button>
        </div>
      ) : (
        <div className="booking-list">
          {bookings.map((booking) => (
            <article className="booking-card" key={booking.id}>
              <div className={`booking-poster poster-tone-${booking.showtime.movie.posterTone ?? 1}`}>
                <span>{booking.showtime.movie.title}</span>
              </div>
              <div className="booking-card-main">
                <div className="booking-title-line">
                  <div><span className={`status-chip status-${booking.status.toLowerCase()}`}>{booking.status.replace("_", " ")}</span><h2>{booking.showtime.movie.title}</h2></div>
                  <strong>{money(booking.totalCents)}</strong>
                </div>
                <p>{longDate(booking.showtime.startsAt)} · {time(booking.showtime.startsAt)}</p>
                <p>{booking.showtime.theater.name} · {booking.showtime.screen.name}</p>
                {booking.payments.filter((payment) => payment.status === "SUCCEEDED").slice(-1).map((payment) => (
                  <div className="booking-payment-proof" key={payment.id}>
                    <span>PAID VIA {payment.method}</span>
                    <strong>{payment.providerRef ?? payment.id}</strong>
                  </div>
                ))}
                <div className="booking-footer">
                  <div className="seat-tags">
                    {booking.seats.map((seat) => <span key={seat.id}>{seat.rowLabel}{seat.number}</span>)}
                  </div>
                  <div className="booking-actions">
                    {booking.status === "PENDING_PAYMENT" && (
                      <button className="text-button" onClick={() => openCheckout(booking)}>Complete payment</button>
                    )}
                    {(booking.status === "PENDING_PAYMENT" || booking.status === "CONFIRMED") && (
                      <button className="text-button danger" disabled={busy} onClick={() => cancelBooking(booking)}>Cancel booking</button>
                    )}
                  </div>
                </div>
              </div>
              <div className="ticket-stub">
                <span>BOOKING ID</span>
                <strong>{booking.id.slice(0, 10).toUpperCase()}</strong>
                <div className="barcode">|||| ||| || ||||</div>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );

  const renderAdmin = () => (
    <section className="admin-page">
      <div className="admin-hero">
        <div>
          <span className="section-kicker light">SYSTEM DESIGN RECRUITER LAB</span>
          <h1>See the engineering<br />behind the experience.</h1>
          <p>Operate catalogue workflows, create seat inventory, and run the double-booking race live.</p>
        </div>
        <div className="admin-health">
          <span className={mode === "live" ? "health-dot live" : "health-dot"} />
          <div><strong>{mode === "live" ? "API connected" : "Interactive demo mode"}</strong><small>{mode === "live" ? "PostgreSQL · Prisma · Express" : "No local backend detected"}</small></div>
        </div>
      </div>

      <div className="metric-grid">
        <div className="metric-card"><span>Isolation level</span><strong>SERIALIZABLE</strong><small>Highest PostgreSQL isolation for booking writes</small></div>
        <div className="metric-card"><span>Seat identity</span><strong>showtime + seat</strong><small>One unique inventory row per performance</small></div>
        <div className="metric-card"><span>Hold expiry</span><strong>10 minutes</strong><small>Worker releases abandoned reservations</small></div>
        <div className="metric-card"><span>Retry safety</span><strong>Idempotent</strong><small>Client keys prevent duplicate commands</small></div>
      </div>

      {(!user || user.role !== "ADMIN") && (
        <div className="admin-access-banner">
          <div><strong>Admin commands are protected by JWT + role middleware.</strong><span>Use admin@cinema.local / ChangeMe123! when the local API is connected.</span></div>
          <button className="button button-dark" onClick={() => { setAuthEmail("admin@cinema.local"); setAuthPassword("ChangeMe123!"); setAuthMode("login"); setAuthOpen(true); }}>Sign in as admin</button>
        </div>
      )}

      {adminMessage && <div className="admin-message">{adminMessage}</div>}

      <div className="admin-workbench">
        <form className="admin-card" onSubmit={createMovie}>
          <div className="admin-card-heading">
            <span className="step-number">01</span>
            <div><strong>Create catalogue entry</strong><small>Validated admin command</small></div>
          </div>
          <label>Movie title<input value={movieForm.title} onChange={(event) => setMovieForm({ ...movieForm, title: event.target.value })} /></label>
          <label>Description<textarea value={movieForm.description} onChange={(event) => setMovieForm({ ...movieForm, description: event.target.value })} /></label>
          <div className="field-pair">
            <label>Duration<input type="number" value={movieForm.durationMin} onChange={(event) => setMovieForm({ ...movieForm, durationMin: Number(event.target.value) })} /></label>
            <label>Rating<input value={movieForm.rating} onChange={(event) => setMovieForm({ ...movieForm, rating: event.target.value })} /></label>
          </div>
          <button className="button button-dark full" disabled={busy}>Create movie</button>
        </form>

        <form className="admin-card venue-card" onSubmit={setupVenue}>
          <div className="admin-card-heading">
            <span className="step-number">02</span>
            <div><strong>Provision a showtime</strong><small>Theater → screen → seats → inventory</small></div>
          </div>
          <div className="field-pair">
            <label>Theater<input value={venueForm.theaterName} onChange={(event) => setVenueForm({ ...venueForm, theaterName: event.target.value })} /></label>
            <label>City<input value={venueForm.city} onChange={(event) => setVenueForm({ ...venueForm, city: event.target.value })} /></label>
          </div>
          <label>Address<input value={venueForm.address} onChange={(event) => setVenueForm({ ...venueForm, address: event.target.value })} /></label>
          <div className="field-triple">
            <label>Screen<input value={venueForm.screenName} onChange={(event) => setVenueForm({ ...venueForm, screenName: event.target.value })} /></label>
            <label>Rows<input type="number" min="1" max="20" value={venueForm.rows} onChange={(event) => setVenueForm({ ...venueForm, rows: Number(event.target.value) })} /></label>
            <label>Seats / row<input type="number" min="1" max="25" value={venueForm.seatsPerRow} onChange={(event) => setVenueForm({ ...venueForm, seatsPerRow: Number(event.target.value) })} /></label>
          </div>
          <div className="field-pair">
            <label>Starts at<input type="datetime-local" value={venueForm.startsAt} onChange={(event) => setVenueForm({ ...venueForm, startsAt: event.target.value })} /></label>
            <label>Price ₹<input type="number" value={venueForm.priceRupees} onChange={(event) => setVenueForm({ ...venueForm, priceRupees: Number(event.target.value) })} /></label>
          </div>
          <button className="button button-dark full" disabled={busy}>Run setup transaction flow</button>
        </form>

        <div className="admin-card concurrency-card">
          <div className="admin-card-heading">
            <span className="step-number hot">03</span>
            <div><strong>Double-booking race</strong><small>Two requests · one showtime seat</small></div>
          </div>
          <div className="race-diagram">
            <div className="race-client"><span>A</span><small>POST /reserve</small></div>
            <div className="race-lines"><i /><i /></div>
            <div className="race-lock"><span>🔒</span><strong>ShowtimeSeat</strong><small>SELECT … FOR UPDATE</small></div>
            <div className="race-lines reverse"><i /><i /></div>
            <div className="race-client"><span>B</span><small>POST /reserve</small></div>
          </div>
          <div className="race-results">
            {concurrencyResults.length === 0 ? (
              <div className="race-placeholder">Run the race to see PostgreSQL choose exactly one winner.</div>
            ) : concurrencyResults.map((result) => (
              <div className={`race-result race-${result.state}`} key={result.label}>
                <span>{result.state === "running" ? "…" : result.state === "won" ? "✓" : "×"}</span>
                <div><strong>{result.label}</strong><small>{result.detail}</small></div>
              </div>
            ))}
          </div>
          <button className="button button-primary full" disabled={concurrencyBusy} onClick={runConcurrencyDemo}>
            {concurrencyBusy ? "Racing both transactions…" : "Run concurrent requests"}
          </button>
          <p className="lab-note">The visible 40001 serialization conflict in server logs is expected and retried by the service.</p>
        </div>
      </div>
    </section>
  );

  return (
    <div className="app-shell">
      <header className="site-header">
        <div className="header-main">
          <button className="brand" onClick={() => setView("home")} aria-label="CineLoop home">
            <span className="brand-mark">C</span><strong>Cine<span>Loop</span></strong>
          </button>
          <div className="search-box">
            <span>⌕</span>
            <input value={search} onChange={(event) => setSearch(event.target.value)} onFocus={() => setView("home")} placeholder="Search for movies, languages and genres" />
            {search && <button onClick={() => setSearch("")} aria-label="Clear search">×</button>}
          </div>
          <button className="location-button">Bengaluru <span>⌄</span></button>
          <div className={`mode-chip mode-${mode}`}>
            <i />
            {mode === "checking" ? "Connecting…" : mode === "live" ? "Live API" : "Demo mode"}
          </div>
          {user ? (
            <div className="profile-menu">
              <button className="profile-button" onClick={() => loadBookings()}><span>{user.email[0].toUpperCase()}</span>{user.email.split("@")[0]}</button>
              <button className="signout-button" onClick={signOut}>Sign out</button>
            </div>
          ) : (
            <button className="signin-button" onClick={() => setAuthOpen(true)}>Sign in</button>
          )}
        </div>
        <nav className="subnav">
          <div>
            <button className={view === "home" ? "active" : ""} onClick={() => setView("home")}>Movies</button>
            <button onClick={() => { setView("home"); setNotice("Stream is a visual preview; booking correctness is this project’s core."); }}>Stream</button>
            <button onClick={() => { setView("home"); setNotice("Events are represented as a visual portfolio surface."); }}>Events</button>
            <button onClick={() => { setView("home"); setNotice("Plays are represented as a visual portfolio surface."); }}>Plays</button>
            <button className={view === "bookings" ? "active" : ""} onClick={() => loadBookings()}>My bookings</button>
          </div>
          <div>
            <button className={view === "admin" ? "active" : ""} onClick={() => setView("admin")}>System design lab</button>
            <span className="portfolio-label">RECRUITER DEMO</span>
          </div>
        </nav>
      </header>

      <main>
        {view === "home" && renderHome()}
        {view === "showtimes" && renderShowtimes()}
        {view === "seats" && renderSeats()}
        {view === "checkout" && renderCheckout()}
        {view === "bookings" && renderBookings()}
        {view === "admin" && renderAdmin()}
      </main>

      <footer className="site-footer">
        <div className="footer-brand"><span className="brand-mark">C</span><strong>CineLoop</strong></div>
        <p>A backend-first movie booking system made visible. Original demo interface for portfolio use.</p>
        <div><span>Serializable transactions</span><span>Row locks</span><span>Idempotency</span><span>Background expiry</span></div>
      </footer>

      {authOpen && (
        <div className="modal-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) setAuthOpen(false); }}>
          <div className="auth-modal" role="dialog" aria-modal="true" aria-labelledby="auth-title">
            <button className="modal-close" onClick={() => setAuthOpen(false)} aria-label="Close">×</button>
            <div className="auth-brand"><span className="brand-mark">C</span><span>SECURE ACCESS</span></div>
            <h2 id="auth-title">{authMode === "login" ? "Welcome back" : "Create your account"}</h2>
            <p>{mode === "live" ? "Connected to the real JWT authentication service." : "Demo mode stores this session only in your browser."}</p>
            <form onSubmit={submitAuth}>
              <label>Email address<input type="email" required value={authEmail} onChange={(event) => setAuthEmail(event.target.value)} /></label>
              <label>Password<input type="password" minLength={8} required value={authPassword} onChange={(event) => setAuthPassword(event.target.value)} /></label>
              <button className="button button-primary full" disabled={authBusy}>{authBusy ? "Securing session…" : authMode === "login" ? "Sign in" : "Create account"}</button>
            </form>
            {mode === "live" && (
              <button className="credential-hint" onClick={() => { setAuthEmail("admin@cinema.local"); setAuthPassword("ChangeMe123!"); }}>
                <span>Seeded admin</span><strong>admin@cinema.local</strong><small>Click to fill credentials</small>
              </button>
            )}
            <button className="auth-switch" onClick={() => setAuthMode(authMode === "login" ? "register" : "login")}>
              {authMode === "login" ? "New to CineLoop? Create an account" : "Already registered? Sign in"}
            </button>
          </div>
        </div>
      )}

      {notice && <div className="toast"><span>✓</span>{notice}</div>}
    </div>
  );
}
