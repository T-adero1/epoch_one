# Epoch One

A clean, fast, and efficient contract management system built with Next.js 14, Tailwind CSS, and SWR - optimized for Nigerian users with offline capabilities.

## Tech Stack

- **Next.js 14+** with App Router
- **Tailwind CSS** for styling
- **SWR** for data fetching and caching
- **localStorage** for offline draft saving

## Getting Started

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd epoch-one
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Run the development server:
   ```bash
   npm run dev
   ```

4. Open [http://localhost:3000](http://localhost:3000) in your browser to see the application.

## Features

- **Contract Management**: View and manage your contracts
- **Dashboard**: Filter contracts by status
- **Offline Drafts**: Draft contracts are automatically saved to localStorage
- **Responsive Navigation**: Mobile-friendly navigation with hamburger menu
- **Fast Performance**: Optimized for speed and low data usage
- **Clean UI**: Simple, intuitive interface
- **Mobile Friendly**: Responsive design that works on all devices

## Project Structure

- `src/app/page.tsx` - Main page with contract list and draft editor
- `src/app/dashboard/page.tsx` - Dashboard with filterable contract view
- `src/components/DraftEditor.tsx` - Component for creating contract drafts with localStorage
- `src/components/Navbar.tsx` - Responsive navigation component
- `src/app/api/contracts/route.ts` - API route for contract data (mock data for now)

## Development

To customize the application:

1. Modify the UI in the components
2. Add new API routes in the `src/app/api` directory
3. Extend the functionality with additional components and pages

## Deployment

This application can be deployed to Vercel, Netlify, or any other hosting service that supports Next.js.

```bash
npm run build
```
