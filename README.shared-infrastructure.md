# Shared Infrastructure Setup

This project uses shared infrastructure services (PostgreSQL, Kafka, Zookeeper) that can be used across multiple projects.

## Structure

```
/root-directory/
  ├── docker-compose.shared.yml    # Shared infrastructure services
  ├── prisma/                      # Shared Prisma schema and database
  │   ├── schema.prisma
  │   └── migrations/
  │
  └── project-1/                  # Your projects
      ├── compose.yaml             # Uses shared infrastructure
      └── src/
```

## Starting Shared Infrastructure

First, start the shared infrastructure services:

```bash
# From the root directory
docker-compose -f docker-compose.shared.yml up -d
```

This will start:

- **PostgreSQL** (port 5432) - Container name: `shared-postgres`
- **Zookeeper** (port 2181) - Container name: `shared-zookeeper`
- **Kafka** (ports 9092, 9093) - Container name: `shared-kafka`
- **Adminer** (port 8080) - Container name: `shared-adminer` - Database management UI

All services use the `shared-infrastructure-network` network.

## Starting Project Services

After shared infrastructure is running, start your project:

```bash
# From project directory
cd mev-bot-server
docker-compose up -d
```

Your project will connect to:

- **Database**: `shared-postgres:5432`
- **Kafka**: `shared-kafka:9093`

## Environment Variables

The shared infrastructure uses these environment variables (can be set in `.env` at root):

```env
# PostgreSQL
POSTGRES_USER=mev_bot
POSTGRES_PASSWORD=123456
POSTGRES_DB=mev_bot

# Project-specific variables
KAFKA_CLIENT_ID=mev-bot
KAFKA_GROUP_ID=mev-bot-group
KAFKA_TRANSACTIONS_TOPIC=pending-transactions
KAFKA_OPPORTUNITIES_TOPIC=detected-opportunities
```

## Adding New Projects

When creating a new project that uses the shared infrastructure:

1. Create your project directory (e.g., `project-2/`)
2. In your `compose.yaml`, reference the shared network:
   ```yaml
   networks:
     shared-infrastructure-network:
       external: true
       name: shared-infrastructure-network
   ```
3. Use shared service names in your environment:
   - Database: `shared-postgres:5432`
   - Kafka: `shared-kafka:9093`
4. Use the shared Prisma schema:
   ```typescript
   import { PrismaClient } from "../../../prisma/generated/prisma/client";
   ```

## Stopping Services

```bash
# Stop project services
cd mev-bot-server
docker-compose down

# Stop shared infrastructure
cd ..
docker-compose -f docker-compose.shared.yml down
```

## Benefits

- **Single Kafka instance** shared across all projects
- **Single PostgreSQL database** (or separate databases in the same instance)
- **Consistent networking** - all projects can communicate
- **Resource efficiency** - one set of infrastructure services
- **Easy topic management** - all projects use the same Kafka cluster
