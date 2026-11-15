import type {
  Booking,
  Movie,
  SeatMap,
  Showtime,
  ShowtimeSeat,
  Theater,
} from "./types";

export const demoMovies: Movie[] = [
  {
    id: "00000000-0000-4000-8000-000000000001",
    title: "The Last Orbit",
    description:
      "A crew races to return home after a deep-space mission fractures time around them.",
    durationMin: 128,
    rating: "UA 13+",
    genre: "Sci-fi · Thriller",
    language: "English",
    score: 9.1,
    votes: "18.4K",
    posterTone: 1,
    badge: "TRENDING",
  },
  {
    id: "00000000-0000-4000-8000-000000000002",
    title: "Monsoon Signal",
    description:
      "Two radio hosts follow a mysterious broadcast through a rain-soaked coastal city.",
    durationMin: 116,
    rating: "UA 16+",
    genre: "Mystery · Drama",
    language: "Kannada",
    score: 8.7,
    votes: "12.1K",
    posterTone: 2,
    badge: "SELLING FAST",
  },
  {
    id: "00000000-0000-4000-8000-000000000003",
    title: "Paper Kingdom",
    description:
      "A young illustrator discovers that every city she draws exists for exactly one night.",
    durationMin: 104,
    rating: "U",
    genre: "Fantasy · Family",
    language: "Hindi",
    score: 8.5,
    votes: "9.8K",
    posterTone: 3,
    badge: "FAMILY PICK",
  },
  {
    id: "00000000-0000-4000-8000-000000000004",
    title: "City After Dark",
    description:
      "An off-duty detective has one night to stop a heist moving through Bengaluru.",
    durationMin: 142,
    rating: "A",
    genre: "Action · Crime",
    language: "Tamil",
    score: 8.9,
    votes: "21.7K",
    posterTone: 4,
    badge: "BLOCKBUSTER",
  },
  {
    id: "00000000-0000-4000-8000-000000000005",
    title: "7:42 to Mysuru",
    description:
      "Four strangers miss the last train and find an unexpected route home.",
    durationMin: 98,
    rating: "U",
    genre: "Comedy · Romance",
    language: "Kannada",
    score: 8.3,
    votes: "7.2K",
    posterTone: 5,
    badge: "NEW RELEASE",
  },
];

export const comingSoonMovies: Movie[] = [
  {
    id: "coming-1",
    title: "Beyond the Blue",
    description:
      "A cartographer follows an impossible constellation to the edge of the known universe. An original CineLoop preview film.",
    durationMin: 132,
    rating: "UA 13+",
    genre: "Sci-fi · Adventure",
    language: "English",
    score: 8.8,
    posterTone: 1,
    badge: "COMING SOON",
  },
  {
    id: "coming-2",
    title: "The Folding Sky",
    description:
      "A young dreamer discovers a city in the clouds, where every wish begins as a folded piece of paper. An original CineLoop preview film.",
    durationMin: 108,
    rating: "U",
    genre: "Fantasy · Family",
    language: "Hindi",
    score: 8.6,
    posterTone: 3,
    badge: "COMING SOON",
  },
  {
    id: "coming-3",
    title: "One More Summer",
    description:
      "An unexpected train journey reunites two friends and changes the direction of their lives. An original CineLoop preview film.",
    durationMin: 112,
    rating: "U",
    genre: "Comedy · Romance",
    language: "Kannada",
    score: 8.4,
    posterTone: 5,
    badge: "COMING SOON",
  },
];

export const demoTheaters: Theater[] = [
  {
    id: "10000000-0000-4000-8000-000000000001",
    name: "Aurora Cinema",
    city: "Bengaluru",
    address: "42 MG Road, Ashok Nagar",
  },
  {
    id: "10000000-0000-4000-8000-000000000002",
    name: "Forum Premiere",
    city: "Bengaluru",
    address: "Koramangala 7th Block",
  },
  {
    id: "10000000-0000-4000-8000-000000000003",
    name: "Skyline Screens",
    city: "Bengaluru",
    address: "Orion Avenue, Rajajinagar",
  },
];

const futureAt = (dayOffset: number, hour: number, minute = 0) => {
  const date = new Date();
  date.setDate(date.getDate() + dayOffset);
  date.setHours(hour, minute, 0, 0);
  return date.toISOString();
};

export const makeDemoShowtimes = (movie = demoMovies[0]): Showtime[] =>
  [
    {
      theater: demoTheaters[0],
      screenName: "Screen 1",
      day: 1,
      hour: 10,
      minute: 30,
      price: 24900,
    },
    {
      theater: demoTheaters[0],
      screenName: "Screen 1",
      day: 1,
      hour: 14,
      minute: 15,
      price: 29900,
    },
    {
      theater: demoTheaters[0],
      screenName: "Screen 2",
      day: 1,
      hour: 19,
      minute: 40,
      price: 34900,
    },
    {
      theater: demoTheaters[1],
      screenName: "Luxe 3",
      day: 1,
      hour: 12,
      minute: 5,
      price: 39900,
    },
    {
      theater: demoTheaters[1],
      screenName: "Luxe 3",
      day: 2,
      hour: 17,
      minute: 20,
      price: 44900,
    },
    {
      theater: demoTheaters[2],
      screenName: "Audi 5",
      day: 2,
      hour: 21,
      minute: 10,
      price: 32900,
    },
  ].map((slot, index) => ({
    id: `20000000-0000-4000-8000-${String(movie.posterTone ?? 1).padStart(6, "0")}${String(index + 1).padStart(6, "0")}`,
    movieId: movie.id,
    screenId: `30000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    startsAt: futureAt(slot.day, slot.hour, slot.minute),
    priceCents: slot.price,
    status: "SCHEDULED",
    movie,
    screen: {
      id: `30000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
      name: slot.screenName,
      theater: slot.theater,
    },
  }));

const seatStatus = (row: string, number: number): ShowtimeSeat["status"] => {
  if ((row === "B" && [3, 4].includes(number)) || (row === "E" && number === 8))
    return "BOOKED";
  if ((row === "C" && [6, 7].includes(number)) || (row === "D" && number === 2))
    return "HELD";
  return "AVAILABLE";
};

export const makeDemoSeatMap = (showtime: Showtime): SeatMap => ({
  id: showtime.id,
  startsAt: showtime.startsAt,
  priceCents: showtime.priceCents,
  movie: showtime.movie,
  theater: showtime.screen.theater,
  screen: { id: showtime.screen.id, name: showtime.screen.name },
  seats: ["A", "B", "C", "D", "E"].flatMap((rowLabel) =>
    Array.from({ length: 10 }, (_, index) => {
      const number = index + 1;
      return {
        id: `40000000-0000-4000-${rowLabel.charCodeAt(0)}00-${String(number).padStart(12, "0")}`,
        rowLabel,
        number,
        seatType:
          rowLabel === "E"
            ? "RECLINER"
            : rowLabel === "D"
              ? "PREMIUM"
              : "STANDARD",
        status: seatStatus(rowLabel, number),
      };
    }),
  ),
});

export const makeDemoBooking = (
  showtime: Showtime,
  seats: ShowtimeSeat[],
  status: Booking["status"] = "PENDING_PAYMENT",
): Booking => {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 10 * 60_000);
  return {
    id: `BK${Math.random().toString(36).slice(2, 9).toUpperCase()}`,
    status,
    totalCents: showtime.priceCents * seats.length,
    expiresAt: status === "PENDING_PAYMENT" ? expiresAt.toISOString() : null,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    showtime: {
      id: showtime.id,
      startsAt: showtime.startsAt,
      movie: showtime.movie,
      theater: showtime.screen.theater,
      screen: { id: showtime.screen.id, name: showtime.screen.name },
    },
    seats: seats.map((seat) => ({
      id: seat.id,
      rowLabel: seat.rowLabel,
      number: seat.number,
      seatType: seat.seatType,
      priceCents: showtime.priceCents,
    })),
    payments: [],
  };
};
