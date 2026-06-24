import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
    const url = request.nextUrl.clone();
    
    // Regla obligatoria: /drivers es ruta exclusiva de reclutamiento conductor.
    // Redirigir siempre a /driver/register
    if (url.pathname === '/drivers' || url.pathname === '/drivers/') {
        url.pathname = '/driver/register';
        return NextResponse.redirect(url);
    }
    
    // Regla para /driver/login -> /login?role=driver
    if (url.pathname === '/driver/login' || url.pathname === '/driver/login/') {
        url.pathname = '/login';
        url.searchParams.set('role', 'driver');
        return NextResponse.redirect(url);
    }

    return NextResponse.next();
}

export const config = {
    matcher: ['/drivers', '/drivers/', '/driver/login', '/driver/login/'],
};
