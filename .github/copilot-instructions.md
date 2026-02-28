# Event manager application

Event manager application is a web application that allows users to create and manage events. Users can create events, edit and delete events, invite guests, and track RSVPs. The application also provides a calendar view of my events and all public events. The application is built using with JS and Supabase. Users register / login, then calendar view with all public events, view with my event dashboard and create event, view with invitations. The application also integrates with Google Calendar API to sync events with users' Google Calendar.

## Architecture 
Use a classical client-server app:
- Frontend: JS app
- Backend: Supabase 
- Database: PostgreSQL
- Authentication: Supabase Auth
- Build tools: Vite, npm
- API: Supabase REST API and Google Calendar API
- Hosting: Netlify
- Source code: Github

## Modular design
Use a modular architecture, with separate files for different components, pages and features. Use ES6 modules to organize the code.

## UI Guidelines
- Use HTML, CSS, and vanilla JS for the frontend.
- Use Bootstrap components and utilities to create a responsive and user-friendly interface.
- Implement modern, responsive UI design with semantic HTML.
- Use a consistent color scheme and typography throughout the application.
- Use appropriate icons, effects and visual cues to enhance the user experience.
- Use fullcalendar view to display all events (public and private), with options to filter by calendar name.

## Pages and Navigation
- Split the app into multiple pages: Login/Register, Calendar View, My Events, Create Event, Invitations
- Implement pages as reusable components (HTML, CSS and JS code)
- Use routing to navigate between pages
- Use full urls for navigation (e.g. /login, /calendar, /my-events, /create-event, /invitations)

## Backend and Database
- Use Supabase as the backend and database for app.
- Use PostgreSQL as the database, with tables for users, calendars, events, participants (RSVPs).
- Use Supabase Storage for file uploads (e.g. event attachments)
- When changing the DB schema, always use migrations to keep track of changes.
- After applying  a migration in Supabase , keep a copy of the migration SQL file in code.

## Authentication and Authorization
- Use Supabase Auth for user authentication and authorization.
- Implement RLS policies to restrict access to data based on user roles and permissions.
- Implement user roles with a separate DB table 'user_roles' + enum 'roles'.
- Use Google Calendar API to sync events with users' Google Calendar.
