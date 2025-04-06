# SecurePrint Project

SecurePrint is a comprehensive printing solution that consists of three main components: a backend server, a Next.js frontend, and an Electron-based desktop client.

## Project Structure
secureprint/
├── backend/        # Node.js backend server
├── my-app/         # Next.js frontend application
└── secprint/       # Electron-based desktop client
Copy
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

1. Clone the repository:
git clone https://github.com/yourusername/secureprint.git
cd secureprint
Copy
2. Install dependencies:
yarn install
Copy
3. Bootstrap the project:
npx lerna bootstrap
Copy
## Development

To run each component for development:

1. Backend:
cd backend
yarn start
Copy
2. Frontend:
cd my-app
yarn dev
Copy
3. Desktop Client:
cd secprint
yarn start
Copy
## Deployment

- Backend: Deployed on Google Cloud Platform (GCP) free tier
- Frontend: Deployed on Vercel free plan
- Desktop Client: Distributed as a standalone application

## Contributing

Please read [CONTRIBUTING.md](CONTRIBUTING.md) for details on our code of conduct and the process for submitting pull requests.

## License

This project is licensed under the [MIT License](LICENSE).

## Contact
