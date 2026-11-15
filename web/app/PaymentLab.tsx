"use client";

import { useEffect, useState } from "react";
import { paymentLabApi } from "./api";
import { CinemaIcon } from "./CinemaIcon";
import type { PaymentLabRun, PaymentLabScenario } from "./payment-lab-types";
import type { User } from "./types";

const scenarios: Array<{
  id: PaymentLabScenario;
  number: string;
  title: string;
  trigger: string;
  result: string;
}> = [
  {
    id: "DUPLICATE",
    number: "01",
    title: "Same event. Five deliveries.",
    trigger:
      "The provider loses its acknowledgement and sends the same signed success event five times.",
    result:
      "One inbox row, one payment, one confirmed booking. Delivery count: five.",
  },
  {
    id: "RESTART",
    number: "02",
    title: "Stored. Then interrupted.",
    trigger:
      "The API stores the webhook, but processing stops before it can confirm the booking.",
    result:
      "Restore the saved run after an API restart, then process the persisted event. No in-memory queue is needed.",
  },
  {
    id: "LATE",
    number: "03",
    title: "Payment arrives too late.",
    trigger:
      "A hold expires. Another customer buys that seat. The first customer's success event finally arrives.",
    result:
      "The second ticket stays valid. The first charge is recorded and flagged REFUND_REQUIRED.",
  },
];

function simulate(scenario: PaymentLabScenario, resume = false): PaymentLabRun {
  const waiting = scenario === "RESTART" && !resume;
  const late = scenario === "LATE";
  const id = `walkthrough-${scenario.toLowerCase()}`;
  return {
    source: "simulation",
    runId: id,
    scenario,
    event: {
      id: "example-inbox-row",
      providerEventId: "evt_example_001",
      status: waiting ? "RECEIVED" : late ? "REFUND_REQUIRED" : "PROCESSED",
      deliveryCount: scenario === "DUPLICATE" ? 5 : 1,
      attempts: waiting ? 0 : 1,
      receivedAt: new Date().toISOString(),
      processedAt: waiting ? null : new Date().toISOString(),
      lastError: late ? "SEATS_CANNOT_BE_FULFILLED" : null,
    },
    booking: {
      id: "booking-original",
      status: waiting ? "PENDING_PAYMENT" : late ? "EXPIRED" : "CONFIRMED",
      expiresAt: waiting ? new Date(Date.now() + 600_000).toISOString() : null,
    },
    seat: {
      label: "L1",
      status: waiting ? "HELD" : "BOOKED",
      ownerBookingId: late ? "booking-second-customer" : "booking-original",
    },
    payments: waiting
      ? []
      : [
          {
            id: "example-payment",
            providerRef: "pay_example_001",
            status: "SUCCEEDED",
            amountCents: 29900,
          },
        ],
    competitor: late
      ? { id: "booking-second-customer", status: "CONFIRMED" }
      : null,
    checks: [
      {
        label: "Illustrative expected outcome",
        passed: true,
        detail: waiting
          ? "The event waits for processing. This browser walkthrough does not prove durability."
          : late
            ? "The second customer keeps the seat; the first payment needs compensation."
            : "Repeated delivery produces one effective confirmation in the proposed flow.",
      },
    ],
  };
}

export function PaymentLab({
  mode,
  token,
  user,
  onBack,
  onSignIn,
  onAuthError,
}: {
  mode: "checking" | "live" | "demo";
  token: string;
  user: User | null;
  onBack: () => void;
  onSignIn: () => void;
  onAuthError: (error: unknown) => boolean;
}) {
  const [scenario, setScenario] = useState<PaymentLabScenario>("DUPLICATE");
  const [run, setRun] = useState<PaymentLabRun | null>(null);
  const [runId, setRunId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const live = mode === "live";
  const permitted = !live || (user?.role === "ADMIN" && Boolean(token));
  const selected = scenarios.find((item) => item.id === scenario)!;
  const storageKey = `cineloop-payment-lab:${user?.id ?? "guest"}`;

  const remember = (result: PaymentLabRun) => {
    setRun(result);
    setRunId(result.runId);
    setScenario(result.scenario);
    if (result.source === "postgresql")
      window.localStorage.setItem(storageKey, result.runId);
  };

  useEffect(() => {
    const saved = window.localStorage.getItem(storageKey);
    if (saved) setRunId(saved);
  }, [storageKey]);

  const perform = async (action: "create" | "read" | "resume") => {
    if (!permitted) {
      onSignIn();
      return;
    }
    setBusy(true);
    setError("");
    try {
      if (!live) {
        remember(
          simulate(
            scenario,
            action === "resume",
          ),
        );
      } else {
        const result =
          action === "create"
            ? await paymentLabApi.create(token, scenario)
            : action === "read"
              ? await paymentLabApi.read(token, runId.trim())
              : await paymentLabApi.resume(token, runId.trim());
        remember(result);
      }
    } catch (failure) {
      if (!onAuthError(failure))
        setError(
          failure instanceof Error
            ? failure.message
            : "The lab request failed.",
        );
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="payment-lab-page">
      <button className="back-link" onClick={onBack}>
        ← System design lab
      </button>
      <div className="payment-lab-heading">
        <div>
          <span className="section-kicker">
            BREAK THE FLOW. KEEP THE GUARANTEES.
          </span>
          <h1>Payment reliability lab.</h1>
          <p>
            Inspect what happens when a payment arrives twice, processing stops,
            or the seat is already gone.
          </p>
        </div>
        <span className={`lab-source ${live ? "connected" : ""}`}>
          <i />
          {live
            ? "PostgreSQL-backed experiments"
            : "Offline walkthrough · simulated"}
        </span>
      </div>
      <div
        className="payment-pipeline"
        aria-label="Payment processing architecture"
      >
        {[
          ["01", "Mock provider", "Signed payment event"],
          ["02", "Durable inbox", "Verify → store → acknowledge"],
          ["03", "Worker", "Lock → validate → apply"],
          ["04", "Booking", "Confirm or compensate"],
        ].map(([number, title, detail], index) => (
          <div key={number}>
            <span>{number}</span>
            <strong>{title}</strong>
            <small>{detail}</small>
            {index < 3 && <CinemaIcon name="arrow" size={17} />}
          </div>
        ))}
      </div>
      {!permitted && (
        <div className="admin-access-banner">
          <div>
            <strong>Live experiments require an admin account.</strong>
            <span>
              Each run creates a separate test theater and seat in the System
              Lab city. Customer inventory is never used.
            </span>
          </div>
          <button className="button button-dark" onClick={onSignIn}>
            Sign in as admin
          </button>
        </div>
      )}
      {!live && (
        <div className="lab-explanation">
          This is a browser simulation. No webhook is sent and no database
          result is being claimed. Start the API and PostgreSQL, reload the
          page, and sign in as admin to run the real experiments.
        </div>
      )}
      <div
        className="payment-scenarios"
        role="group"
        aria-label="Payment failure scenarios"
      >
        {scenarios.map((item) => (
          <button
            key={item.id}
            className={scenario === item.id ? "selected" : ""}
            aria-pressed={scenario === item.id}
            onClick={() => {
              setScenario(item.id);
              setRun(null);
              setError("");
            }}
            disabled={busy}
          >
            <span>SCENARIO {item.number}</span>
            <strong>{item.title}</strong>
            <p>{item.trigger}</p>
            <div>
              Explore failure
              <CinemaIcon name="arrow" size={15} />
            </div>
          </button>
        ))}
      </div>
      <div className="payment-experiment-grid">
        <div className="lab-experiment-card">
          <span className="section-kicker">THE EXPERIMENT</span>
          <h2>{selected.title}</h2>
          <p>{selected.trigger}</p>
          <div className="expected-result">
            <span>EXPECTED GUARANTEE</span>
            <p>{selected.result}</p>
          </div>
          <button
            className="button button-primary full"
            onClick={() => void perform("create")}
            disabled={busy || mode === "checking"}
          >
            {busy
              ? "Running experiment…"
              : live
                ? "Run against PostgreSQL"
                : "Run simulated walkthrough"}
            <CinemaIcon name="arrow" size={17} />
          </button>
          {scenario === "RESTART" && (
            <p className="lab-caveat">
              This control pauses processing; it does not terminate a process.
              In live mode, copy the run ID, restart the API/worker yourself,
              restore the run, and process the saved event. The normal worker
              deliberately skips manual lab events.
            </p>
          )}
        </div>
        <div className="lab-experiment-card lab-restore">
          <span className="section-kicker">
            DURABLE STATE, NOT A BROWSER TIMER
          </span>
          <h2>Restore or replay a run.</h2>
          <p>
            A live run ID survives a page refresh or API restart because its
            state is stored in PostgreSQL. The browser remembers only the ID.
          </p>
          <label>
            Run / booking ID
            <input
              value={runId}
              onChange={(event) => setRunId(event.target.value)}
              placeholder="Paste the saved booking UUID"
              disabled={busy}
            />
          </label>
          <div className="lab-restore-actions">
            <button
              className="button button-ghost"
              disabled={busy || !runId.trim() || !live}
              onClick={() => void perform("read")}
            >
              Restore database state
            </button>
            <button
              className="button button-dark"
              disabled={busy || !run || (live && !permitted)}
              onClick={() => void perform("resume")}
            >
              {run?.event.status === "RECEIVED"
                ? "Process saved event"
                : "Replay processing"}
            </button>
          </div>
          <small>
            Replay is idempotent. A completed event must not create another
            payment.
          </small>
        </div>
      </div>
      {error && (
        <div className="payment-lab-error" role="alert">
          {error}
        </div>
      )}
      {run && (
        <div className="payment-lab-results" aria-live="polite">
          <div className="section-heading">
            <div>
              <span className="section-kicker">OBSERVED RESULT</span>
              <h2>
                {run.event.status === "RECEIVED"
                  ? "Event stored. Processing paused."
                  : run.event.status === "REFUND_REQUIRED"
                    ? "Charge recorded. Seat protected."
                    : "One event. One effective outcome."}
              </h2>
            </div>
            <span className="lab-source">
              {run.source === "postgresql"
                ? "Read from PostgreSQL"
                : "Simulated values"}
            </span>
          </div>
          <div className="lab-result-metrics">
            <div>
              <span>Deliveries</span>
              <strong>{run.event.deliveryCount}</strong>
              <small>Same provider event ID</small>
            </div>
            <div>
              <span>Successful payments</span>
              <strong>
                {
                  run.payments.filter(
                    (payment) => payment.status === "SUCCEEDED",
                  ).length
                }
              </strong>
              <small>For the original booking</small>
            </div>
            <div>
              <span>Booking state</span>
              <strong className="text-metric">{run.booking.status}</strong>
              <small>Original customer's booking</small>
            </div>
            <div>
              <span>Inbox state</span>
              <strong className="text-metric">{run.event.status}</strong>
              <small>{run.event.attempts} processing attempt(s)</small>
            </div>
          </div>
          <div className="lab-checks">
            {run.checks.map((check) => (
              <div
                key={check.label}
                className={check.passed ? "passed" : "failed"}
              >
                <span>{check.passed ? "✓" : "×"}</span>
                <div>
                  <strong>{check.label}</strong>
                  <p>{check.detail}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="lab-seat-proof">
            <CinemaIcon name="seat" size={27} />
            <div>
              <strong>
                Seat {run.seat.label} · {run.seat.status}
              </strong>
              <span>
                Owner:{" "}
                {run.competitor
                  ? "second customer's confirmed booking"
                  : "original booking"}
              </span>
            </div>
            <code>{run.seat.ownerBookingId ?? "none"}</code>
          </div>
          {run.event.status === "REFUND_REQUIRED" && (
            <div className="compensation-note">
              <strong>
                Compensation required, not automatically completed.
              </strong>
              <p>
                The provider success is recorded, but the original booking
                cannot be fulfilled. This project flags the case for refund
                handling; it has not moved money or issued a real refund.
              </p>
            </div>
          )}
          <details className="lab-raw-state">
            <summary>Inspect event, payment, and inventory records</summary>
            <pre>{JSON.stringify(run, null, 2)}</pre>
          </details>
        </div>
      )}
      <div className="lab-redis-note">
        <CinemaIcon name="screen" size={25} />
        <div>
          <strong>Why this uses PostgreSQL without Redis</strong>
          <p>
            The inbox and booking update share one transaction boundary. Redis
            can later cache catalogue reads or coordinate rate limits; seat
            ownership and payment recovery remain durable database
            responsibilities.
          </p>
        </div>
      </div>
    </section>
  );
}
