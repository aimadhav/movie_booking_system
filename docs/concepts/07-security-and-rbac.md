# Authentication and RBAC

```mermaid
flowchart LR
  Password --> Argon2id[Argon2id hash] --> UserTable[(User)]
  Login --> JWT[Signed short-lived JWT]
  JWT --> Middleware[Verify signature and claims]
  Middleware --> RBAC[Customer or Admin authorization]
```

Passwords are hashed with Argon2id, not encrypted or stored directly. JWTs identify an authenticated user; RBAC determines whether that user can invoke an admin command.

The server derives the user identity from a verified token. It never accepts a `userId` or `role` supplied in a booking request body.

