# Authz today-vs-matrix (Phase 2 inventory)

| Resource / path | Before Phase 2 | After Phase 2 |
|---|---|---|
| GET /candidates/* | JWT only | `read:candidates` |
| GET/POST/PUT /probation | JWT only | method → `probation` |
| GET /ocr/health | JWT only | `read:ocr` (admin via `*`; viewer/operator denied) |
| POST /ocr/convert | JWT only | `create:ocr` (admin only) |
| POST /photos | JWT only | `create:photos` (operator+admin) |
| GET /dashboard | JWT only | `read:dashboard` |
| GET /personnel, /civil-servants | JWT only | `read:personnel` |
| GET /profile | JWT only | `read:profile` |
| awards / decorations / import / … | already `requirePermission` | unchanged |

Open Q3 default: viewer **denied** awards, decorations, retirement, analytics, work_results, ocr.
