"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { cinemaApi, CinemaApiError } from "./api";
import {
  demoMovies,
  demoTheaters,
  comingSoonMovies,
  makeDemoBooking,
  makeDemoSeatMap,
  makeDemoShowtimes,
} from "./demo-data";
import { CinemaIcon } from "./CinemaIcon";
import { PaymentLab } from "./PaymentLab";
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

type View =
  | "home"
  | "showtimes"
  | "seats"
  | "checkout"
  | "bookings"
  | "admin"
  | "payment-lab";
type DataMode = "checking" | "live" | "demo";
type AuthMode = "login" | "register";
type PaymentStage = "ready" | "processing" | "failed" | "succeeded";
type MockPaymentOutcome = "SUCCEEDED" | "FAILED";

const SESSION_KEY = "cineloop-session";
const dayKey = (value: string) => new Date(value).toLocaleDateString("en-CA");

const money = (cents: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(cents / 100);

const shortDate = (value: string) =>
  new Intl.DateTimeFormat("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(new Date(value));

const longDate = (value: string) =>
  new Intl.DateTimeFormat("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(value));

const time = (value: string) =>
  new Intl.DateTimeFormat("en-IN", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));

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
  error instanceof CinemaApiError
    ? error.message
    : "Something unexpected happened. Please try again.";

const countdownLabel = (expiresAt: string | null, now: number) => {
  if (!expiresAt) return "Paid";
  const remaining = Math.max(0, new Date(expiresAt).getTime() - now);
  const minutes = Math.floor(remaining / 60_000);
  const seconds = Math.floor((remaining % 60_000) / 1_000);
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
};

export function CinemaApp({ initialView = "home" }: { initialView?: View }) {
  const [view, setView] = useState<View>(initialView);
  const [mode, setMode] = useState<DataMode>("checking");
  const [movies, setMovies] = useState<Movie[]>(demoMovies);
  const [selectedMovie, setSelectedMovie] = useState<Movie>(demoMovies[0]);
  const [showtimes, setShowtimes] = useState<Showtime[]>(
    makeDemoShowtimes(demoMovies[0]),
  );
  const [liveShowtimeIds, setLiveShowtimeIds] = useState<string[]>([]);
  const [selectedShowtime, setSelectedShowtime] = useState<Showtime | null>(
    null,
  );
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
  const [movieTab, setMovieTab] = useState<"now" | "soon">("now");
  const [genreFilter, setGenreFilter] = useState("All films");
  const [heroIndex, setHeroIndex] = useState(0);
  const [infoMovie, setInfoMovie] = useState<Movie | null>(null);
  const [theatersOpen, setTheatersOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState("");
  const [theaterFilter, setTheaterFilter] = useState("");
  const movieRail = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [now, setNow] = useState(Date.now());
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("UPI");
  const [paymentStage, setPaymentStage] = useState<PaymentStage>("ready");
  const [mockPaymentOutcome, setMockPaymentOutcome] =
    useState<MockPaymentOutcome>("SUCCEEDED");
  const [paymentReceipt, setPaymentReceipt] = useState<Payment | null>(null);
  const [adminMessage, setAdminMessage] = useState("");
  const [concurrencyResults, setConcurrencyResults] = useState<
    Array<{ label: string; state: string; detail: string }>
  >([]);
  const [concurrencyBusy, setConcurrencyBusy] = useState(false);
  const [movieForm, setMovieForm] = useState({
    title: "Midnight Protocol",
    description:
      "A systems engineer discovers a message hidden inside the city traffic network.",
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
    let storedSession: { user: User; token: string } | null = null;
    if (stored) {
      try {
        storedSession = JSON.parse(stored) as { user: User; token: string };
        setUser(storedSession.user);
        setToken(storedSession.token);
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
        setMovies([
          ...liveMovies,
          ...demoMovies.filter((movie) => !titles.has(movie.title)),
        ]);
        if (liveMovies[0]) {
          setSelectedMovie(liveMovies[0]);
          const liveShows = await cinemaApi.showtimes(liveMovies[0].id);
          if (liveShows.items.length > 0) {
            const enrichedShows = liveShows.items.map((item) => ({
              ...item,
              movie: enrichMovie(item.movie, 0),
            }));
            setShowtimes(enrichedShows);
            setLiveShowtimeIds(enrichedShows.map((item) => item.id));
          }
        }
        setMode("live");

        if (storedSession) {
          try {
            const currentUser = await cinemaApi.session(storedSession.token);
            setUser(currentUser);
          } catch (error) {
            if (error instanceof CinemaApiError && error.status === 401) {
              setUser(null);
              setToken("");
              setBookings([]);
              window.localStorage.removeItem(SESSION_KEY);
              setAuthMode("login");
              setAuthOpen(true);
              setNotice("Your session expired. Sign in again to continue.");
            }
          }
        }
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

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [view]);

  useEffect(() => {
    if (!authOpen && !infoMovie && !theatersOpen) return;
    const previous = document.body.style.overflow;
    const previousFocus = document.activeElement as HTMLElement | null;
    document.body.style.overflow = "hidden";
    const focusTimer = window.setTimeout(
      () =>
        document.querySelector<HTMLElement>('[role="dialog"] button')?.focus(),
      0,
    );
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setAuthOpen(false);
        setInfoMovie(null);
        setTheatersOpen(false);
      }
      if (event.key === "Tab") {
        const elements = document.querySelectorAll<HTMLElement>(
          '[role="dialog"] button:not(:disabled), [role="dialog"] input, [role="dialog"] textarea',
        );
        const first = elements[0];
        const last = elements[elements.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        }
        if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    window.addEventListener("keydown", close);
    return () => {
      window.clearTimeout(focusTimer);
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", close);
      previousFocus?.focus();
    };
  }, [authOpen, infoMovie, theatersOpen]);

  const visibleMovies = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (movieTab === "now" ? movies : comingSoonMovies).filter((movie) => {
      const matchesSearch =
        !query ||
        [movie.title, movie.genre, movie.language].some((value) =>
          value?.toLowerCase().includes(query),
        );
      return (
        matchesSearch &&
        (genreFilter === "All films" ||
          movie.genre?.toLowerCase().includes(genreFilter.toLowerCase()))
      );
    });
  }, [movies, search, movieTab, genreFilter]);

  const featuredMovies = [demoMovies[0], demoMovies[1], demoMovies[3]];
  const featuredMovie = featuredMovies[heroIndex];
  const featuredBookingMovie =
    movies.find((movie) => movie.title === featuredMovie.title) ??
    featuredMovie;

  const selectedSeats = useMemo(
    () =>
      seatMap?.seats.filter((seat) => selectedSeatIds.includes(seat.id)) ?? [],
    [seatMap, selectedSeatIds],
  );

  const isLiveFlow = selectedShowtime
    ? mode === "live" && liveShowtimeIds.includes(selectedShowtime.id)
    : false;
  const usesLiveBookingApi = (booking: Booking) =>
    mode === "live" && !booking.id.startsWith("BK");

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
    window.localStorage.setItem(
      SESSION_KEY,
      JSON.stringify({ user: nextUser, token: nextToken }),
    );
  };

  const clearSession = () => {
    setUser(null);
    setToken("");
    setBookings([]);
    window.localStorage.removeItem(SESSION_KEY);
  };

  const signOut = () => {
    clearSession();
    setNotice("You have been signed out.");
  };

  const handleSessionFailure = (error: unknown) => {
    if (!(error instanceof CinemaApiError) || error.status !== 401)
      return false;
    clearSession();
    setAuthMode("login");
    setAuthOpen(true);
    setAdminMessage("");
    setNotice(
      "Your access token expired or is no longer valid. Sign in again to continue.",
    );
    return true;
  };

  const openMovie = async (movie: Movie) => {
    setSelectedMovie(movie);
    setSelectedDate("");
    setTheaterFilter("");
    setBusy(true);
    setView("showtimes");
    try {
      if (mode === "live") {
        const result = await cinemaApi.showtimes(movie.id);
        if (result.items.length > 0) {
          const liveItems = result.items.map((item) => ({
            ...item,
            movie: enrichMovie(item.movie, 0),
          }));
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
      if (current.includes(seat.id))
        return current.filter((id) => id !== seat.id);
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
        ? await cinemaApi.reserve(
            token,
            selectedShowtime.id,
            selectedSeats.map((seat) => seat.id),
          )
        : makeDemoBooking(selectedShowtime, selectedSeats);
      setActiveBooking(booking);
      resetMockPayment();
      setBookings((current) => [
        booking,
        ...current.filter((item) => item.id !== booking.id),
      ]);
      setView("checkout");
      setNotice(
        `Seats held for ${countdownLabel(booking.expiresAt, Date.now())} minutes.`,
      );
    } catch (error) {
      if (!handleSessionFailure(error)) setNotice(getErrorMessage(error));
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
    if (
      activeBooking.expiresAt &&
      new Date(activeBooking.expiresAt).getTime() <= Date.now()
    ) {
      setPaymentStage("failed");
      setNotice("This seat hold has expired. Please choose the seats again.");
      return;
    }

    setBusy(true);
    setPaymentStage("processing");
    try {
      const livePayment = usesLiveBookingApi(activeBooking);
      const payment = livePayment
        ? await cinemaApi.processMockPayment(
            token,
            activeBooking.id,
            paymentMethod,
            mockPaymentOutcome,
          )
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
        setBookings((current) => [
          pending,
          ...current.filter((item) => item.id !== pending.id),
        ]);
        setPaymentReceipt(payment);
        setPaymentStage("failed");
        setNotice(
          "Mock gateway declined the payment. Your seats remain held while the timer is active.",
        );
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
          persistedBooking =
            result.items.find((booking) => booking.id === activeBooking.id) ??
            confirmed;
          setBookings(result.items);
        } catch {
          setBookings((current) => [
            confirmed,
            ...current.filter((item) => item.id !== confirmed.id),
          ]);
        }
      } else {
        setBookings((current) => [
          confirmed,
          ...current.filter((item) => item.id !== confirmed.id),
        ]);
      }

      setActiveBooking(persistedBooking);
      setPaymentReceipt(payment);
      setPaymentStage("succeeded");
      setNotice("Payment succeeded. The booking and seats are now confirmed.");
    } catch (error) {
      setPaymentStage("failed");
      if (!handleSessionFailure(error)) setNotice(getErrorMessage(error));
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
      if (!handleSessionFailure(error)) setNotice(getErrorMessage(error));
    }
  };

  const cancelBooking = async (booking: Booking) => {
    if (!user || !token) return;
    setBusy(true);
    try {
      const cancelled = usesLiveBookingApi(booking)
        ? await cinemaApi.cancel(token, booking.id)
        : {
            ...booking,
            status: "CANCELLED" as const,
            expiresAt: null,
            updatedAt: new Date().toISOString(),
          };
      setBookings((current) =>
        current.map((item) => (item.id === booking.id ? cancelled : item)),
      );
      setNotice("Booking cancelled and seats released.");
    } catch (error) {
      if (!handleSessionFailure(error)) setNotice(getErrorMessage(error));
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
        const role = authEmail.toLowerCase().includes("admin")
          ? "ADMIN"
          : "CUSTOMER";
        saveSession(
          {
            id: crypto.randomUUID(),
            email: authEmail,
            role,
            createdAt: new Date().toISOString(),
          },
          `demo-${crypto.randomUUID()}`,
        );
      }
      setAuthOpen(false);
      setNotice(
        authMode === "login"
          ? "Welcome back to CineLoop."
          : "Your CineLoop account is ready.",
      );
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
      if (!handleSessionFailure(error)) setAdminMessage(getErrorMessage(error));
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
        if (!movie)
          throw new Error("Create a movie before setting up a showtime.");
        const theater = await cinemaApi.createTheater(token, {
          name: venueForm.theaterName,
          city: venueForm.city,
          address: venueForm.address,
        });
        const screen = await cinemaApi.createScreen(token, {
          theaterId: theater.id,
          name: venueForm.screenName,
        });
        await cinemaApi.addSeats(
          token,
          screen.id,
          venueForm.rows,
          venueForm.seatsPerRow,
        );
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
      if (!handleSessionFailure(error)) setAdminMessage(getErrorMessage(error));
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
      const useLive =
        mode === "live" && liveShowtimeIds.includes(targetShowtime.id);
      if (useLive) {
        const currentMap = await cinemaApi.seatMap(targetShowtime.id);
        const available = currentMap.seats.find(
          (seat) => seat.status === "AVAILABLE",
        );
        if (!available)
          throw new Error(
            "No available seat remains for the concurrency demo.",
          );
        targetSeat = available;
      } else {
        targetShowtime = makeDemoShowtimes(selectedMovie)[0];
        targetSeat = makeDemoSeatMap(targetShowtime).seats.find(
          (seat) => seat.status === "AVAILABLE",
        )!;
      }

      if (useLive) {
        const results = await Promise.allSettled([
          cinemaApi.reserve(
            token,
            targetShowtime.id,
            [targetSeat.id],
            `race-a-${crypto.randomUUID()}`,
          ),
          cinemaApi.reserve(
            token,
            targetShowtime.id,
            [targetSeat.id],
            `race-b-${crypto.randomUUID()}`,
          ),
        ]);
        const authenticationFailure = results.find(
          (result) =>
            result.status === "rejected" &&
            result.reason instanceof CinemaApiError &&
            result.reason.status === 401,
        );
        if (authenticationFailure?.status === "rejected")
          throw authenticationFailure.reason;
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
          {
            label: "Request A",
            state: "won",
            detail: `201 Created · seat ${targetSeat.rowLabel}${targetSeat.number} held`,
          },
          {
            label: "Request B",
            state: "lost",
            detail: "409 Conflict · SEAT_UNAVAILABLE",
          },
        ]);
      }
    } catch (error) {
      if (!handleSessionFailure(error)) {
        setConcurrencyResults([
          { label: "Demo", state: "lost", detail: getErrorMessage(error) },
        ]);
      } else {
        setConcurrencyResults([]);
      }
    } finally {
      setConcurrencyBusy(false);
    }
  };

  const renderHome = () => (
    <>
      <section
        className={`hero hero-film-${featuredMovie.posterTone}`}
        aria-label="Featured movie"
      >
        <div className="hero-image" key={featuredMovie.id} />
        <div className="hero-grain" />
        <div className="hero-copy">
          <div className="eyebrow">
            <span /> THE BIG SCREEN. THE FULL EXPERIENCE.
          </div>
          <div className="hero-feature-label">
            CINELOOP FEATURE PRESENTATION
          </div>
          <h1>
            {featuredMovie.title === "The Last Orbit" ? (
              <>
                <span className="hero-title-line">THE LAST</span>
                <em>ORBIT</em>
              </>
            ) : (
              featuredMovie.title.toUpperCase()
            )}
          </h1>
          <div className="hero-film-meta">
            <span className="certificate">{featuredMovie.rating}</span>
            <span>{featuredMovie.durationMin} MIN</span>
            <i />
            <span>{featuredMovie.genre?.split(" · ")[0].toUpperCase()}</span>
            <span className="hero-rating">★ {featuredMovie.score}</span>
          </div>
          <p>{featuredMovie.description}</p>
          <div className="hero-actions">
            <button
              className="button button-primary"
              onClick={() => void openMovie(featuredBookingMovie)}
            >
              Get tickets <CinemaIcon name="arrow" size={18} />
            </button>
            <button
              className="hero-story-button"
              onClick={() => setInfoMovie(featuredMovie)}
            >
              Explore the story <CinemaIcon name="arrow" size={17} />
            </button>
          </div>
        </div>
        <div className="hero-bottom">
          <div className="hero-caption">
            <span className="tiny-cross">+</span> SOME STORIES NEED A BIGGER
            SCREEN.
          </div>
          <div className="hero-pagination">
            <span>
              {String(heroIndex + 1).padStart(2, "0")} <small>/ 03</small>
            </span>
            <div className="hero-pagination-dots">
              {featuredMovies.map((film, index) => (
                <button
                  key={film.id}
                  className={heroIndex === index ? "active" : ""}
                  aria-label={`Feature ${film.title}`}
                  aria-pressed={heroIndex === index}
                  onClick={() => setHeroIndex(index)}
                />
              ))}
            </div>
            <button
              className="round-button"
              aria-label="Previous featured movie"
              onClick={() => setHeroIndex((heroIndex + 2) % 3)}
            >
              <CinemaIcon name="arrow" className="rotate-arrow" size={17} />
            </button>
            <button
              className="round-button"
              aria-label="Next featured movie"
              onClick={() => setHeroIndex((heroIndex + 1) % 3)}
            >
              <CinemaIcon name="arrow" size={17} />
            </button>
          </div>
        </div>
      </section>

      <div className="quick-book-bar">
        <div className="quick-book-intro">
          <CinemaIcon name="ticket" size={23} />
          <div>
            <strong>Your next great night out.</strong>
            <span>Find a film. Pick your seats. Make a memory.</span>
          </div>
        </div>
        <button
          className="quick-location"
          onClick={() => setTheatersOpen(true)}
        >
          <CinemaIcon name="pin" size={18} />
          <span>
            <small>YOUR LOCATION</small>
            <strong>Bengaluru</strong>
          </span>
          <CinemaIcon name="chevron" size={16} />
        </button>
        <button
          className="text-button quick-find"
          onClick={() => {
            document
              .getElementById("movies")
              ?.scrollIntoView({ behavior: "smooth" });
          }}
        >
          Find your movie <CinemaIcon name="arrow" size={19} />
        </button>
      </div>

      <section className="content-section" id="movies">
        <div className="section-heading">
          <div className="movie-tabs" role="tablist" aria-label="Movie program">
            <button
              role="tab"
              aria-selected={movieTab === "now"}
              className={movieTab === "now" ? "active" : ""}
              onClick={() => {
                setMovieTab("now");
                setGenreFilter("All films");
              }}
            >
              Now showing<span>{movies.length}</span>
            </button>
            <button
              role="tab"
              aria-selected={movieTab === "soon"}
              className={movieTab === "soon" ? "active" : ""}
              onClick={() => {
                setMovieTab("soon");
                setGenreFilter("All films");
              }}
            >
              Coming soon
            </button>
          </div>
          <div className="rail-controls">
            <button
              className="round-button"
              aria-label="Previous movies"
              onClick={() =>
                movieRail.current?.scrollBy({ left: -500, behavior: "smooth" })
              }
            >
              <CinemaIcon name="arrow" className="rotate-arrow" size={18} />
            </button>
            <button
              className="round-button"
              aria-label="More movies"
              onClick={() =>
                movieRail.current?.scrollBy({ left: 500, behavior: "smooth" })
              }
            >
              <CinemaIcon name="arrow" size={18} />
            </button>
          </div>
        </div>
        <div className="movie-filter-row">
          <div className="genre-filters" aria-label="Filter movies by genre">
            {["All films", "Sci-fi", "Action", "Drama", "Family", "Comedy"].map(
              (genre) => (
                <button
                  key={genre}
                  aria-pressed={genreFilter === genre}
                  className={genreFilter === genre ? "active" : ""}
                  onClick={() => setGenreFilter(genre)}
                >
                  {genre}
                </button>
              ),
            )}
          </div>
          <span className="section-count">
            {visibleMovies.length}{" "}
            {visibleMovies.length === 1 ? "film" : "films"} to discover
          </span>
        </div>
        <div className="movie-grid" ref={movieRail}>
          {visibleMovies.map((movie, index) => (
            <article className="movie-card" key={movie.id}>
              <button
                className="movie-poster-button"
                onClick={() =>
                  movieTab === "soon"
                    ? setInfoMovie(movie)
                    : void openMovie(movie)
                }
                aria-label={`${movieTab === "soon" ? "View details" : "View showtimes"} for ${movie.title}`}
              >
                <div
                  className={`poster-art poster-tone-${movie.posterTone ?? (index % 5) + 1}`}
                >
                  <span className="poster-badge">{movie.badge}</span>
                  <div className="poster-film-label">
                    CINELOOP PICTURES PRESENTS
                  </div>
                  <div className="poster-title">
                    {movie.title.toUpperCase()}
                  </div>
                  <div className="poster-credit">EXPERIENCE IT IN CINEMAS</div>
                  <div className="poster-hover">
                    <span>
                      <CinemaIcon name="ticket" size={19} />
                      {movieTab === "soon"
                        ? "Discover the film"
                        : "Get tickets"}
                    </span>
                  </div>
                </div>
              </button>
              <div className="movie-card-copy">
                <div className="movie-card-title">
                  <h3>
                    <button
                      onClick={() =>
                        movieTab === "soon"
                          ? setInfoMovie(movie)
                          : void openMovie(movie)
                      }
                    >
                      {movie.title}
                    </button>
                  </h3>
                  <span>★ {movie.score}</span>
                </div>
                <p>
                  <span className="movie-certificate">{movie.rating}</span>
                  {movie.durationMin} min <i /> {movie.genre?.split(" · ")[0]}
                </p>
                <button
                  className="movie-ticket-link"
                  onClick={() =>
                    movieTab === "soon"
                      ? setInfoMovie(movie)
                      : void openMovie(movie)
                  }
                >
                  {movieTab === "soon"
                    ? "Explore the film"
                    : "Showtimes & tickets"}
                  <CinemaIcon name="arrow" size={16} />
                </button>
              </div>
            </article>
          ))}
          {visibleMovies.length === 0 && (
            <div className="empty-state">
              <CinemaIcon name="search" size={34} />
              <strong>No films found</strong>
              <span>Try a different title or genre.</span>
              <button
                className="text-button"
                onClick={() => {
                  setSearch("");
                  setGenreFilter("All films");
                }}
              >
                Clear filters
              </button>
            </div>
          )}
        </div>
      </section>

      <section className="content-section experiences-section" id="experiences">
        <div className="section-heading">
          <div>
            <span className="section-kicker">MORE THAN A MOVIE</span>
            <h2>Make it an experience.</h2>
          </div>
          <p>Little details. A bigger night.</p>
        </div>
        <div className="experience-grid">
          <button
            className="experience-card experience-screen"
            onClick={() => void openMovie(featuredBookingMovie)}
          >
            <div className="experience-symbol">
              <CinemaIcon name="screen" size={38} />
            </div>
            <span>THE BIG PICTURE</span>
            <strong>
              A bigger screen.
              <br />A bigger escape.
            </strong>
            <p>Find your next escape on the big screen.</p>
            <div className="experience-card-bottom">
              Explore movies
              <CinemaIcon name="arrow" size={21} />
            </div>
          </button>
          <button
            className="experience-card experience-comfort"
            onClick={() => setTheatersOpen(true)}
          >
            <div className="experience-symbol">
              <CinemaIcon name="seat" size={38} />
            </div>
            <span>YOUR PERFECT SPOT</span>
            <strong>
              Good movie.
              <br />
              Even better seat.
            </strong>
            <p>Choose your view. Settle into the story.</p>
            <div className="experience-card-bottom">
              Find a theater
              <CinemaIcon name="arrow" size={21} />
            </div>
          </button>
          <button
            className="experience-card experience-night"
            onClick={() => {
              setMovieTab("now");
              setGenreFilter("Family");
              document
                .getElementById("movies")
                ?.scrollIntoView({ behavior: "smooth" });
            }}
          >
            <div className="experience-symbol">
              <CinemaIcon name="spark" size={38} />
            </div>
            <span>BRING YOUR PEOPLE</span>
            <strong>
              Big feelings.
              <br />
              Shared together.
            </strong>
            <p>Find something the whole crew will love.</p>
            <div className="experience-card-bottom">
              Find a family favorite
              <CinemaIcon name="arrow" size={21} />
            </div>
          </button>
        </div>
      </section>

      <section className="cinema-manifesto">
        <div className="manifesto-orbit" />
        <span className="section-kicker">LESS SCROLLING. MORE CINEMA.</span>
        <h2>
          Some things are
          <br />
          better <em>on the big screen.</em>
        </h2>
        <button
          className="button button-primary"
          onClick={() => {
            setMovieTab("now");
            setGenreFilter("All films");
            document
              .getElementById("movies")
              ?.scrollIntoView({ behavior: "smooth" });
          }}
        >
          Find your next film
          <CinemaIcon name="arrow" size={18} />
        </button>
        <span className="manifesto-footnote">
          THE LIGHTS GO DOWN. THE WORLD OPENS UP.
        </span>
      </section>
    </>
  );

  const showDates = useMemo(
    () =>
      [
        ...new Set(
          showtimes
            .filter(
              (showtime) =>
                !theaterFilter || showtime.screen.theater.id === theaterFilter,
            )
            .map((showtime) => dayKey(showtime.startsAt)),
        ),
      ].sort(),
    [showtimes, theaterFilter],
  );
  const activeDate = selectedDate || showDates[0];
  const groupedShowtimes = useMemo(() => {
    const groups = new Map<string, Showtime[]>();
    showtimes.forEach((showtime) => {
      if (
        dayKey(showtime.startsAt) !== activeDate ||
        (theaterFilter && showtime.screen.theater.id !== theaterFilter)
      )
        return;
      const key = showtime.screen.theater.id;
      groups.set(key, [...(groups.get(key) ?? []), showtime]);
    });
    return [...groups.values()];
  }, [showtimes, activeDate, theaterFilter]);

  const renderShowtimes = () => (
    <section className="flow-page">
      <button className="back-link" onClick={() => setView("home")}>
        ← Back to movies
      </button>
      <div className="movie-detail-header">
        <div
          className={`mini-poster poster-tone-${selectedMovie.posterTone ?? 1}`}
        >
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

      <div className="showtime-selection-heading">
        <div>
          <CinemaIcon name="pin" size={18} />
          <span>
            Theaters in <strong>Bengaluru</strong>
          </span>
        </div>
        <span>Choose a day. Find your perfect time.</span>
      </div>
      <div className="date-scroller" aria-label="Select show date">
        {showDates.map((key) => {
          const date = new Date(`${key}T12:00:00`);
          return (
            <button
              className={key === activeDate ? "date-pill active" : "date-pill"}
              key={key}
              aria-pressed={key === activeDate}
              onClick={() => setSelectedDate(key)}
            >
              <span>
                {new Intl.DateTimeFormat("en-IN", { weekday: "short" }).format(
                  date,
                )}
              </span>
              <strong>{date.getDate()}</strong>
              <small>
                {new Intl.DateTimeFormat("en-IN", { month: "short" }).format(
                  date,
                )}
              </small>
            </button>
          );
        })}
      </div>

      <div className="showtime-panel">
        <div className="showtime-info-bar">
          <span>
            <i className="availability-dot" /> Available
          </span>
          <span>Cancellation available</span>
          <span>Prices in INR · per person</span>
        </div>
        {busy ? (
          <div className="loading-block">Finding the best screens…</div>
        ) : groupedShowtimes.length === 0 ? (
          <div className="empty-state">
            <strong>No shows yet</strong>
            <span>Try another date or movie.</span>
          </div>
        ) : (
          groupedShowtimes.map((items) => {
            const theater = items[0].screen.theater;
            return (
              <article className="theater-row" key={theater.id}>
                <div className="theater-copy">
                  <div className="theater-title">
                    <CinemaIcon name="pin" size={19} />
                    <strong>{theater.name}</strong>
                  </div>
                  <p>{theater.address}</p>
                  <div>
                    <span className="amenity">Mobile tickets</span>
                    <span className="amenity food">Reserved seating</span>
                  </div>
                </div>
                <div className="time-list">
                  {items.map((showtime) => (
                    <button
                      key={showtime.id}
                      className="time-button"
                      onClick={() => openSeats(showtime)}
                    >
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
    seatMap?.seats.forEach((seat) =>
      rows.set(seat.rowLabel, [...(rows.get(seat.rowLabel) ?? []), seat]),
    );
    return [...rows.entries()];
  }, [seatMap]);

  const renderSeats = () => (
    <section className="seat-page">
      <div className="seat-topbar">
        <button
          className="back-link compact"
          onClick={() => setView("showtimes")}
        >
          ←
        </button>
        <div>
          <strong>{seatMap?.movie.title ?? selectedMovie.title}</strong>
          <span>
            {seatMap
              ? `${seatMap.theater.name} · ${shortDate(seatMap.startsAt)} · ${time(seatMap.startsAt)}`
              : "Loading seat map…"}
          </span>
        </div>
        <div className="seat-count-chip">
          {selectedSeatIds.length || 0} seats
        </div>
      </div>
      <div className="seat-workspace">
        <div className="seat-legend">
          <span>
            <i className="seat-swatch available" />
            Available
          </span>
          <span>
            <i className="seat-swatch selected" />
            Selected
          </span>
          <span>
            <i className="seat-swatch held" />
            Held
          </span>
          <span>
            <i className="seat-swatch booked" />
            Booked
          </span>
        </div>
        <div className="seat-category">
          <span>STANDARD & PREMIUM</span>
          <span>{seatMap ? money(seatMap.priceCents) : "—"}</span>
        </div>
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
          <span>
            {selectedSeats.length
              ? selectedSeats
                  .map((seat) => `${seat.rowLabel}${seat.number}`)
                  .join(", ")
              : "Select up to 10 seats"}
          </span>
          <strong>
            {seatMap ? money(seatMap.priceCents * selectedSeats.length) : "—"}
          </strong>
        </div>
        <button
          className="button button-primary wide"
          disabled={!selectedSeats.length || busy}
          onClick={reserveSeats}
        >
          {busy
            ? "Locking seats…"
            : selectedSeats.length
              ? `Hold ${selectedSeats.length} seat${selectedSeats.length > 1 ? "s" : ""}`
              : "Choose seats"}
        </button>
      </div>
    </section>
  );

  const renderCheckout = () => {
    if (!activeBooking) return null;
    const fee = Math.round(activeBooking.totalCents * 0.047);
    const holdExpired = Boolean(
      activeBooking.expiresAt &&
        new Date(activeBooking.expiresAt).getTime() <= now,
    );

    if (paymentStage === "succeeded" && paymentReceipt) {
      return (
        <section className="checkout-page payment-success-page">
          <div className="payment-success-card">
            <div className="success-check" aria-hidden="true">
              ✓
            </div>
            <span className="section-kicker">YOU'RE GOING TO THE MOVIES</span>
            <h1>Consider your plans made.</h1>
            <p>
              Your seats are saved and your ticket is ready. Find all the
              details in My tickets.
            </p>
            <div
              className="success-state-flow"
              aria-label="Completed booking states"
            >
              <div>
                <span>PAYMENT</span>
                <strong>SUCCEEDED</strong>
              </div>
              <i>→</i>
              <div>
                <span>BOOKING</span>
                <strong>CONFIRMED</strong>
              </div>
              <i>→</i>
              <div>
                <span>SEATS</span>
                <strong>BOOKED</strong>
              </div>
            </div>
            <div className="success-receipt">
              <div>
                <span>Movie</span>
                <strong>{activeBooking.showtime.movie.title}</strong>
              </div>
              <div>
                <span>Seats</span>
                <strong>
                  {activeBooking.seats
                    .map((seat) => `${seat.rowLabel}${seat.number}`)
                    .join(", ")}
                </strong>
              </div>
              <div>
                <span>Paid using</span>
                <strong>{paymentReceipt.method}</strong>
              </div>
              <div>
                <span>Amount</span>
                <strong>{money(paymentReceipt.amountCents)}</strong>
              </div>
              <div>
                <span>Booking ID</span>
                <strong>{activeBooking.id.toUpperCase()}</strong>
              </div>
              <div>
                <span>Gateway reference</span>
                <strong>
                  {paymentReceipt.providerRef ?? paymentReceipt.id}
                </strong>
              </div>
            </div>
            <div className="success-actions">
              <button
                className="button button-primary"
                onClick={() => void loadBookings()}
              >
                View my tickets
              </button>
              <button
                className="button button-ghost"
                onClick={() => setView("home")}
              >
                Book another movie
              </button>
            </div>
          </div>
        </section>
      );
    }

    return (
      <section className="checkout-page">
        <div className="checkout-heading">
          <button
            className="back-link"
            onClick={() => setView(selectedShowtime ? "seats" : "bookings")}
          >
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
              <div
                className={`checkout-poster poster-tone-${activeBooking.showtime.movie.posterTone ?? 1}`}
              >
                <span>{activeBooking.showtime.movie.title}</span>
              </div>
              <div>
                <span className="ticket-status">PENDING PAYMENT</span>
                <h2>{activeBooking.showtime.movie.title}</h2>
                <p>
                  {longDate(activeBooking.showtime.startsAt)} ·{" "}
                  {time(activeBooking.showtime.startsAt)}
                </p>
                <p>
                  {activeBooking.showtime.theater.name},{" "}
                  {activeBooking.showtime.theater.city}
                </p>
                <div className="seat-tags">
                  {activeBooking.seats.map((seat) => (
                    <span key={seat.id}>
                      {seat.rowLabel}
                      {seat.number}
                    </span>
                  ))}
                </div>
              </div>
            </div>
            <div className="checkout-card trust-card">
              <CinemaIcon name="clock" size={25} />
              <div>
                <strong>Your seats are saved for you.</strong>
                <p>
                  Complete checkout before the timer ends. Your selected seats
                  stay protected while you pay.
                </p>
              </div>
            </div>
            <div className="checkout-card mock-gateway-card">
              <div className="gateway-heading">
                <div>
                  <span className="section-kicker">ONE LAST STEP</span>
                  <h3>Choose how to pay</h3>
                </div>
                <span className="sandbox-badge">SANDBOX</span>
              </div>
              <div
                className="payment-methods"
                role="group"
                aria-label="Mock payment method"
              >
                {(
                  [
                    ["UPI", "UPI", "demo@cineloop"],
                    ["CARD", "Card", "Visa ending 4242"],
                    ["WALLET", "Wallet", "CineLoop balance"],
                  ] as const
                ).map(([value, label, detail]) => (
                  <button
                    type="button"
                    key={value}
                    className={
                      paymentMethod === value
                        ? "payment-method active"
                        : "payment-method"
                    }
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
                <div
                  className={`instrument-icon instrument-${paymentMethod.toLowerCase()}`}
                >
                  {paymentMethod === "UPI"
                    ? "UPI"
                    : paymentMethod === "CARD"
                      ? "4242"
                      : "CL"}
                </div>
                <div>
                  <span>
                    {paymentMethod === "UPI"
                      ? "Demo UPI address"
                      : paymentMethod === "CARD"
                        ? "Tokenized test card"
                        : "Mock wallet account"}
                  </span>
                  <strong>
                    {paymentMethod === "UPI"
                      ? "demo@cineloop"
                      : paymentMethod === "CARD"
                        ? "•••• •••• •••• 4242"
                        : "CineLoop Wallet · ₹5,000"}
                  </strong>
                </div>
                <small>No real financial details</small>
              </div>
              <div className="outcome-lab">
                <div>
                  <strong>Gateway response</strong>
                  <span>Use failure once to demonstrate retry behavior.</span>
                </div>
                <div
                  className="outcome-options"
                  role="group"
                  aria-label="Mock gateway response"
                >
                  <button
                    type="button"
                    className={
                      mockPaymentOutcome === "SUCCEEDED" ? "active success" : ""
                    }
                    aria-pressed={mockPaymentOutcome === "SUCCEEDED"}
                    disabled={busy}
                    onClick={() => setMockPaymentOutcome("SUCCEEDED")}
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    className={
                      mockPaymentOutcome === "FAILED" ? "active failure" : ""
                    }
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
                  <strong>
                    {holdExpired
                      ? "Seat hold expired"
                      : "Payment declined safely"}
                  </strong>
                  <span>
                    {holdExpired
                      ? "Your hold has ended. Return to the seat map to choose available seats."
                      : "Your seats are still saved while the timer runs. Select Approve and try again."}
                  </span>
                </div>
              )}
            </div>
          </div>
          <aside className="price-card">
            <span className="section-kicker">PRICE DETAILS</span>
            <h3>Order summary</h3>
            <div className="price-row">
              <span>Tickets ({activeBooking.seats.length})</span>
              <strong>{money(activeBooking.totalCents)}</strong>
            </div>
            <div className="price-row">
              <span>Booking fee</span>
              <strong>{money(fee)}</strong>
            </div>
            <div className="price-row discount">
              <span>CineLoop welcome offer</span>
              <strong>−{money(fee)}</strong>
            </div>
            <div className="price-divider" />
            <div className="price-row total">
              <span>Amount payable</span>
              <strong>{money(activeBooking.totalCents)}</strong>
            </div>
            <div className="gateway-summary">
              <span>Method</span>
              <strong>{paymentMethod}</strong>
              <span>Test response</span>
              <strong
                className={
                  mockPaymentOutcome === "SUCCEEDED" ? "approve" : "decline"
                }
              >
                {mockPaymentOutcome}
              </strong>
            </div>
            <button
              className="button button-primary payment-button"
              disabled={busy || holdExpired}
              onClick={confirmPayment}
            >
              {busy
                ? "Gateway processing…"
                : holdExpired
                  ? "Seat hold expired"
                  : `Pay ${money(activeBooking.totalCents)}`}
            </button>
            <p className="payment-note">
              Mock payment only. No money is moved and no card, UPI, or wallet
              credentials are collected.
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
          <span>
            Sign in to view bookings, complete pending payments, or cancel
            eligible tickets.
          </span>
          <button
            className="button button-primary"
            onClick={() => setAuthOpen(true)}
          >
            Sign in
          </button>
        </div>
      ) : bookings.length === 0 ? (
        <div className="empty-state large">
          <div className="empty-ticket">00</div>
          <strong>No bookings yet</strong>
          <span>Your first big-screen story is only a few clicks away.</span>
          <button
            className="button button-primary"
            onClick={() => setView("home")}
          >
            Explore movies
          </button>
        </div>
      ) : (
        <div className="booking-list">
          {bookings.map((booking) => (
            <article className="booking-card" key={booking.id}>
              <div
                className={`booking-poster poster-tone-${booking.showtime.movie.posterTone ?? 1}`}
              >
                <span>{booking.showtime.movie.title}</span>
              </div>
              <div className="booking-card-main">
                <div className="booking-title-line">
                  <div>
                    <span
                      className={`status-chip status-${booking.status.toLowerCase()}`}
                    >
                      {booking.status.replace("_", " ")}
                    </span>
                    <h2>{booking.showtime.movie.title}</h2>
                  </div>
                  <strong>{money(booking.totalCents)}</strong>
                </div>
                <p>
                  {longDate(booking.showtime.startsAt)} ·{" "}
                  {time(booking.showtime.startsAt)}
                </p>
                <p>
                  {booking.showtime.theater.name} ·{" "}
                  {booking.showtime.screen.name}
                </p>
                {booking.payments
                  .filter((payment) => payment.status === "SUCCEEDED")
                  .slice(-1)
                  .map((payment) => (
                    <div className="booking-payment-proof" key={payment.id}>
                      <span>PAID VIA {payment.method}</span>
                      <strong>{payment.providerRef ?? payment.id}</strong>
                    </div>
                  ))}
                <div className="booking-footer">
                  <div className="seat-tags">
                    {booking.seats.map((seat) => (
                      <span key={seat.id}>
                        {seat.rowLabel}
                        {seat.number}
                      </span>
                    ))}
                  </div>
                  <div className="booking-actions">
                    {booking.status === "PENDING_PAYMENT" && (
                      <button
                        className="text-button"
                        onClick={() => openCheckout(booking)}
                      >
                        Complete payment
                      </button>
                    )}
                    {(booking.status === "PENDING_PAYMENT" ||
                      booking.status === "CONFIRMED") && (
                      <button
                        className="text-button danger"
                        disabled={busy}
                        onClick={() => cancelBooking(booking)}
                      >
                        Cancel booking
                      </button>
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
          <span className="section-kicker light">
            SYSTEM DESIGN RECRUITER LAB
          </span>
          <h1>
            See the engineering
            <br />
            behind the experience.
          </h1>
          <p>
            Operate catalogue workflows, create seat inventory, and run the
            double-booking race live.
          </p>
        </div>
        <div className="admin-health">
          <span
            className={mode === "live" ? "health-dot live" : "health-dot"}
          />
          <div>
            <strong>
              {mode === "live" ? "API connected" : "Interactive demo mode"}
            </strong>
            <small>
              {mode === "live"
                ? "PostgreSQL · Prisma · Express"
                : "No local backend detected"}
            </small>
          </div>
        </div>
      </div>

      <div className="payment-lab-launch">
        <div>
          <span className="section-kicker">NEW FAILURE EXPERIMENTS</span>
          <strong>What if payment succeeds, but the ticket doesn't?</strong>
          <p>
            Test duplicate callbacks, interrupted processing, and a payment that
            arrives after the seat is sold.
          </p>
        </div>
        <button
          className="button button-primary"
          onClick={() => setView("payment-lab")}
        >
          Open payment reliability lab
          <CinemaIcon name="arrow" size={18} />
        </button>
      </div>
      <div className="metric-grid">
        <div className="metric-card">
          <span>Isolation level</span>
          <strong>SERIALIZABLE</strong>
          <small>Highest PostgreSQL isolation for booking writes</small>
        </div>
        <div className="metric-card">
          <span>Seat identity</span>
          <strong>showtime + seat</strong>
          <small>One unique inventory row per performance</small>
        </div>
        <div className="metric-card">
          <span>Hold expiry</span>
          <strong>10 minutes</strong>
          <small>Worker releases abandoned reservations</small>
        </div>
        <div className="metric-card">
          <span>Retry safety</span>
          <strong>Idempotent</strong>
          <small>Client keys prevent duplicate commands</small>
        </div>
      </div>

      {(!user || user.role !== "ADMIN") && (
        <div className="admin-access-banner">
          <div>
            <strong>
              Admin commands are protected by JWT + role middleware.
            </strong>
            <span>
              Use admin@cinema.local / ChangeMe123! when the local API is
              connected.
            </span>
          </div>
          <button
            className="button button-dark"
            onClick={() => {
              setAuthEmail("admin@cinema.local");
              setAuthPassword("ChangeMe123!");
              setAuthMode("login");
              setAuthOpen(true);
            }}
          >
            Sign in as admin
          </button>
        </div>
      )}

      {adminMessage && <div className="admin-message">{adminMessage}</div>}

      <div className="admin-workbench">
        <form className="admin-card" onSubmit={createMovie}>
          <div className="admin-card-heading">
            <span className="step-number">01</span>
            <div>
              <strong>Create catalogue entry</strong>
              <small>Validated admin command</small>
            </div>
          </div>
          <label>
            Movie title
            <input
              value={movieForm.title}
              onChange={(event) =>
                setMovieForm({ ...movieForm, title: event.target.value })
              }
            />
          </label>
          <label>
            Description
            <textarea
              value={movieForm.description}
              onChange={(event) =>
                setMovieForm({ ...movieForm, description: event.target.value })
              }
            />
          </label>
          <div className="field-pair">
            <label>
              Duration
              <input
                type="number"
                value={movieForm.durationMin}
                onChange={(event) =>
                  setMovieForm({
                    ...movieForm,
                    durationMin: Number(event.target.value),
                  })
                }
              />
            </label>
            <label>
              Rating
              <input
                value={movieForm.rating}
                onChange={(event) =>
                  setMovieForm({ ...movieForm, rating: event.target.value })
                }
              />
            </label>
          </div>
          <button className="button button-dark full" disabled={busy}>
            Create movie
          </button>
        </form>

        <form className="admin-card venue-card" onSubmit={setupVenue}>
          <div className="admin-card-heading">
            <span className="step-number">02</span>
            <div>
              <strong>Provision a showtime</strong>
              <small>Theater → screen → seats → inventory</small>
            </div>
          </div>
          <div className="field-pair">
            <label>
              Theater
              <input
                value={venueForm.theaterName}
                onChange={(event) =>
                  setVenueForm({
                    ...venueForm,
                    theaterName: event.target.value,
                  })
                }
              />
            </label>
            <label>
              City
              <input
                value={venueForm.city}
                onChange={(event) =>
                  setVenueForm({ ...venueForm, city: event.target.value })
                }
              />
            </label>
          </div>
          <label>
            Address
            <input
              value={venueForm.address}
              onChange={(event) =>
                setVenueForm({ ...venueForm, address: event.target.value })
              }
            />
          </label>
          <div className="field-triple">
            <label>
              Screen
              <input
                value={venueForm.screenName}
                onChange={(event) =>
                  setVenueForm({ ...venueForm, screenName: event.target.value })
                }
              />
            </label>
            <label>
              Rows
              <input
                type="number"
                min="1"
                max="20"
                value={venueForm.rows}
                onChange={(event) =>
                  setVenueForm({
                    ...venueForm,
                    rows: Number(event.target.value),
                  })
                }
              />
            </label>
            <label>
              Seats / row
              <input
                type="number"
                min="1"
                max="25"
                value={venueForm.seatsPerRow}
                onChange={(event) =>
                  setVenueForm({
                    ...venueForm,
                    seatsPerRow: Number(event.target.value),
                  })
                }
              />
            </label>
          </div>
          <div className="field-pair">
            <label>
              Starts at
              <input
                type="datetime-local"
                value={venueForm.startsAt}
                onChange={(event) =>
                  setVenueForm({ ...venueForm, startsAt: event.target.value })
                }
              />
            </label>
            <label>
              Price ₹
              <input
                type="number"
                value={venueForm.priceRupees}
                onChange={(event) =>
                  setVenueForm({
                    ...venueForm,
                    priceRupees: Number(event.target.value),
                  })
                }
              />
            </label>
          </div>
          <button className="button button-dark full" disabled={busy}>
            Run setup transaction flow
          </button>
        </form>

        <div className="admin-card concurrency-card">
          <div className="admin-card-heading">
            <span className="step-number hot">03</span>
            <div>
              <strong>Double-booking race</strong>
              <small>Two requests · one showtime seat</small>
            </div>
          </div>
          <div className="race-diagram">
            <div className="race-client">
              <span>A</span>
              <small>POST /reserve</small>
            </div>
            <div className="race-lines">
              <i />
              <i />
            </div>
            <div className="race-lock">
              <span>🔒</span>
              <strong>ShowtimeSeat</strong>
              <small>SELECT … FOR UPDATE</small>
            </div>
            <div className="race-lines reverse">
              <i />
              <i />
            </div>
            <div className="race-client">
              <span>B</span>
              <small>POST /reserve</small>
            </div>
          </div>
          <div className="race-results">
            {concurrencyResults.length === 0 ? (
              <div className="race-placeholder">
                Run the race to see PostgreSQL choose exactly one winner.
              </div>
            ) : (
              concurrencyResults.map((result) => (
                <div
                  className={`race-result race-${result.state}`}
                  key={result.label}
                >
                  <span>
                    {result.state === "running"
                      ? "…"
                      : result.state === "won"
                        ? "✓"
                        : "×"}
                  </span>
                  <div>
                    <strong>{result.label}</strong>
                    <small>{result.detail}</small>
                  </div>
                </div>
              ))
            )}
          </div>
          <button
            className="button button-primary full"
            disabled={concurrencyBusy}
            onClick={runConcurrencyDemo}
          >
            {concurrencyBusy
              ? "Racing both transactions…"
              : "Run concurrent requests"}
          </button>
          <p className="lab-note">
            The visible 40001 serialization conflict in server logs is expected
            and retried by the service.
          </p>
        </div>
      </div>
    </section>
  );

  return (
    <div className="app-shell">
      <header className="site-header">
        <div className="announcement-bar">
          <span>
            <i />
            GOOD FILMS. GREAT COMPANY. YOUR SEAT IS WAITING.
          </span>
          <button onClick={() => setView("admin")}>
            Explore the system design lab <CinemaIcon name="arrow" size={12} />
          </button>
        </div>
        <div className="header-main">
          <button
            className="brand"
            onClick={() => setView("home")}
            aria-label="CineLoop home"
          >
            <span className="brand-mark">
              <i />
            </span>
            <strong>
              cine<span>loop</span>
              <small>®</small>
            </strong>
          </button>
          <nav className="main-navigation" aria-label="Main navigation">
            <button
              className={
                ["home", "showtimes", "seats", "checkout"].includes(view)
                  ? "active"
                  : ""
              }
              onClick={() => setView("home")}
            >
              Movies
            </button>
            <button onClick={() => setTheatersOpen(true)}>Theaters</button>
            <button
              onClick={() => {
                setView("home");
                window.setTimeout(
                  () =>
                    document
                      .getElementById("experiences")
                      ?.scrollIntoView({ behavior: "smooth" }),
                  60,
                );
              }}
            >
              Experiences
            </button>
            <button
              className={view === "bookings" ? "active" : ""}
              onClick={() => void loadBookings()}
            >
              My tickets
            </button>
          </nav>
          <div className="header-actions">
            <button
              className="header-icon-button"
              aria-label={searchOpen ? "Close search" : "Search movies"}
              aria-expanded={searchOpen}
              onClick={() => {
                setSearchOpen(!searchOpen);
                setView("home");
              }}
            >
              <CinemaIcon name={searchOpen ? "close" : "search"} size={20} />
            </button>
            <button
              className="location-button"
              onClick={() => setTheatersOpen(true)}
            >
              <CinemaIcon name="pin" size={17} />
              Bengaluru
              <CinemaIcon name="chevron" size={12} />
            </button>
            {user ? (
              <div className="profile-menu">
                <button
                  className="profile-button"
                  onClick={() => void loadBookings()}
                >
                  <span>{user.email[0].toUpperCase()}</span>
                  <strong>{user.email.split("@")[0]}</strong>
                </button>
                <button
                  className="signout-button"
                  aria-label="Sign out"
                  onClick={signOut}
                >
                  Sign out
                </button>
              </div>
            ) : (
              <button
                className="signin-button"
                onClick={() => setAuthOpen(true)}
              >
                <CinemaIcon name="user" size={16} />
                Sign in
              </button>
            )}
          </div>
        </div>
        {searchOpen && (
          <div className="search-drawer">
            <div className="search-box">
              <CinemaIcon name="search" size={21} />
              <input
                autoFocus
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  document
                    .getElementById("movies")
                    ?.scrollIntoView({ behavior: "smooth" });
                }}
                placeholder="Find your next film. Search title, genre or language…"
                aria-label="Search movies"
              />
              {search && (
                <button onClick={() => setSearch("")} aria-label="Clear search">
                  <CinemaIcon name="close" size={18} />
                </button>
              )}
            </div>
          </div>
        )}
      </header>

      <main>
        {view === "home" && renderHome()}
        {view === "showtimes" && renderShowtimes()}
        {view === "seats" && renderSeats()}
        {view === "checkout" && renderCheckout()}
        {view === "bookings" && renderBookings()}
        {view === "admin" && renderAdmin()}
        {view === "payment-lab" && (
          <PaymentLab
            mode={mode}
            token={token}
            user={user}
            onBack={() => setView("admin")}
            onSignIn={() => {
              setAuthEmail("admin@cinema.local");
              setAuthMode("login");
              setAuthOpen(true);
            }}
            onAuthError={handleSessionFailure}
          />
        )}
      </main>

      <footer className="site-footer">
        <div className="footer-top">
          <div>
            <button
              className="brand footer-brand"
              onClick={() => setView("home")}
            >
              <span className="brand-mark">
                <i />
              </span>
              <strong>
                cine<span>loop</span>
                <small>®</small>
              </strong>
            </button>
            <p>For the love of the big screen.</p>
          </div>
          <div className="footer-links">
            <button onClick={() => setView("home")}>Explore movies</button>
            <button onClick={() => setTheatersOpen(true)}>
              Find a theater
            </button>
            <button onClick={() => void loadBookings()}>My tickets</button>
            <button onClick={() => setView("admin")}>
              System design lab
              <CinemaIcon name="arrow" size={14} />
            </button>
          </div>
          <div className="footer-wordmark">
            SEE YOU
            <br />
            <span>AT THE MOVIES.</span>
          </div>
        </div>
        <div className="footer-bottom">
          <span>
            © {new Date().getFullYear()} CineLoop. A movie booking portfolio
            project.
          </span>
          <div className={`mode-chip mode-${mode}`}>
            <i />
            {mode === "checking"
              ? "Connecting to API"
              : mode === "live"
                ? "Connected to live API"
                : "Interactive demo · sample films"}
          </div>
          <span>
            Made for movie people. <CinemaIcon name="spark" size={13} />
          </span>
        </div>
      </footer>

      {theatersOpen && (
        <div
          className="modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setTheatersOpen(false);
          }}
        >
          <div
            className="theater-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="theater-modal-title"
          >
            <button
              className="modal-close"
              onClick={() => setTheatersOpen(false)}
              aria-label="Close theaters"
            >
              <CinemaIcon name="close" />
            </button>
            <span className="section-kicker">A GREAT NIGHT STARTS HERE</span>
            <h2 id="theater-modal-title">Find your cinema.</h2>
            <p>
              <CinemaIcon name="pin" size={16} /> Bengaluru, Karnataka
            </p>
            <div className="theater-directory">
              {(mode === "live"
                ? [
                    ...new Map(
                      showtimes.map((show) => [
                        show.screen.theater.id,
                        show.screen.theater,
                      ]),
                    ).values(),
                  ]
                : demoTheaters
              ).map((theater, index) => (
                <button
                  key={theater.id}
                  onClick={() => {
                    setTheatersOpen(false);
                    void openMovie(selectedMovie).then(() =>
                      setTheaterFilter(theater.id),
                    );
                  }}
                >
                  <span className="theater-directory-number">0{index + 1}</span>
                  <div>
                    <strong>{theater.name}</strong>
                    <span>{theater.address}</span>
                    <small>Reserved seating · Mobile tickets</small>
                  </div>
                  <CinemaIcon name="arrow" size={20} />
                </button>
              ))}
            </div>
            <small className="directory-note">
              Select a theater to see available showtimes for{" "}
              {selectedMovie.title}.
            </small>
          </div>
        </div>
      )}

      {infoMovie && (
        <div
          className="modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setInfoMovie(null);
          }}
        >
          <div
            className="film-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="film-modal-title"
          >
            <button
              className="modal-close"
              onClick={() => setInfoMovie(null)}
              aria-label="Close film details"
            >
              <CinemaIcon name="close" />
            </button>
            <div
              className={`film-modal-art poster-tone-${infoMovie.posterTone ?? 1}`}
            />
            <div className="film-modal-copy">
              <span className="section-kicker">
                {comingSoonMovies.some((movie) => movie.id === infoMovie.id)
                  ? "COMING SOON TO CINELOOP"
                  : "THE STORY BEHIND THE SCREEN"}
              </span>
              <h2 id="film-modal-title">{infoMovie.title}</h2>
              <div className="detail-pills">
                <span>{infoMovie.rating}</span>
                <span>{infoMovie.durationMin} min</span>
                <span>{infoMovie.genre}</span>
              </div>
              <p>{infoMovie.description}</p>
              {comingSoonMovies.some((movie) => movie.id === infoMovie.id) ? (
                <div className="coming-soon-note">
                  Showtimes will be added when this film joins our program.
                  Explore the now-showing collection in the meantime.
                </div>
              ) : (
                <button
                  className="button button-primary"
                  onClick={() => {
                    const movie =
                      movies.find((item) => item.title === infoMovie.title) ??
                      infoMovie;
                    setInfoMovie(null);
                    void openMovie(movie);
                  }}
                >
                  Find showtimes
                  <CinemaIcon name="arrow" size={18} />
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {authOpen && (
        <div
          className="modal-backdrop"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) setAuthOpen(false);
          }}
        >
          <div
            className="auth-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="auth-title"
          >
            <button
              className="modal-close"
              onClick={() => setAuthOpen(false)}
              aria-label="Close"
            >
              ×
            </button>
            <div className="auth-brand">
              <span className="brand-mark">
                <i />
              </span>
              <span>SECURE ACCESS</span>
            </div>
            <h2 id="auth-title">
              {authMode === "login" ? "Welcome back" : "Create your account"}
            </h2>
            <p>
              {mode === "live"
                ? "Your next movie night is one sign-in away."
                : "Explore with a demo account. No real payments, just movie magic."}
            </p>
            <form onSubmit={submitAuth}>
              <label>
                Email address
                <input
                  type="email"
                  required
                  value={authEmail}
                  onChange={(event) => setAuthEmail(event.target.value)}
                />
              </label>
              <label>
                Password
                <input
                  type="password"
                  minLength={8}
                  required
                  value={authPassword}
                  onChange={(event) => setAuthPassword(event.target.value)}
                />
              </label>
              <button
                className="button button-primary full"
                disabled={authBusy}
              >
                {authBusy
                  ? "Securing session…"
                  : authMode === "login"
                    ? "Sign in"
                    : "Create account"}
              </button>
            </form>
            {mode === "live" && (
              <button
                className="credential-hint"
                onClick={() => {
                  setAuthEmail("admin@cinema.local");
                  setAuthPassword("ChangeMe123!");
                }}
              >
                <span>Seeded admin</span>
                <strong>admin@cinema.local</strong>
                <small>Click to fill credentials</small>
              </button>
            )}
            <button
              className="auth-switch"
              onClick={() =>
                setAuthMode(authMode === "login" ? "register" : "login")
              }
            >
              {authMode === "login"
                ? "New to CineLoop? Create an account"
                : "Already registered? Sign in"}
            </button>
          </div>
        </div>
      )}

      {notice && (
        <div className="toast" role="status">
          <CinemaIcon name="ticket" size={19} />
          {notice}
          <button
            onClick={() => setNotice("")}
            aria-label="Dismiss notification"
          >
            <CinemaIcon name="close" size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
