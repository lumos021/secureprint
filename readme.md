# SecurePrint Project

SecurePrint is a comprehensive printing solution that consists of three main components: a backend server, a Next.js frontend, and an Electron-based desktop client.

## Project Structure
```bash
secureprint/
├── backend/        # Node.js backend server
├── my-app/         # Next.js frontend application
└── secprint/       # Electron-based desktop client
```
## Components

### Backend Server

Located in the `backend/` directory, this is the server-side component of the SecurePrint project.

### Frontend Application

The `my-app/` directory contains the Next.js-based frontend application.

### Desktop Client

The `secprint/` directory houses the Electron-based desktop client application.

## Getting Started

### Prerequisites

- Node.js (v14 or later recommended)
- Yarn package manager
- Git

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/secureprint.git
cd secureprint

# Install dependencies
yarn install

# Bootstrap the project
npx lerna bootstrap
```
## Development

To run each component for development:

```bash
# Run Backend
cd backend
yarn start

# Run Frontend
cd my-app
yarn dev

# Run Desktop Client
cd secprint
yarn start
```
## Deployment

- Backend: Deployed on Google Cloud Platform (GCP) free tier
- Frontend: Deployed on Vercel free plan
- Desktop Client: Distributed as a standalone application


## License

This project is licensed under the [MIT License](LICENSE).

