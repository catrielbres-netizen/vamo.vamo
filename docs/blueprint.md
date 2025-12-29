# **App Name**: VamO

## Core Features:

- Passenger Ride Request: Allows passengers to request a ride using their current location and destination input.
- Fare Calculation: Automatically calculates the fare based on distance, estimated time, and selected service type (Premium, Privado, Express), including adjustments for night rates. It will call the Maps tool to assist with distance calculations.
- Driver Interface: Enables drivers to accept, pause, resume, and finalize rides. Displays current ride status and navigation information.
- Real-time Ride Updates: Uses Firestore to provide real-time updates on ride status for both passengers and drivers.
- User Role Management: Distinguishes between passenger, driver, and admin roles, providing role-specific functionalities and interfaces.
- Admin Dashboard: Provides admins with statistics on rides, income, and online drivers. Includes AI-powered data analysis for insights.
- Simultaneous Ride Handling: Supports handling of two simultaneous rides for testing purposes.

## Style Guidelines:

- Primary color: Deep blue (#1A237E) to convey trust and reliability in transportation services.
- Background color: Very light blue (#E8EAF6) to provide a clean and calm backdrop.
- Accent color: Purple (#7E57C2) for highlights and call-to-action buttons, giving a modern and tech-forward feel.
- Body and headline font: 'Inter' sans-serif font to maintain a clean, modern, and readable interface across all devices and screen sizes.
- Code font: 'Source Code Pro' for any code snippets that might appear in admin panels or debugging interfaces.
- Use consistent and recognizable icons for navigation, ride status, and user actions to improve usability.
- Subtle animations during state transitions, like when confirming a ride or updating the map, to give users clear feedback and a polished experience.