import React from 'react';
import { Metadata } from 'next';
import DriverClientLayout from './DriverClientLayout';

export const metadata: Metadata = {
  title: "VamO Conductor",
  manifest: "/manifest-driver.webmanifest",
  applicationName: "VamO Conductor",
  appleWebApp: {
    capable: true,
    title: "VamO Conductor",
    statusBarStyle: "black-translucent",
  },
};

export default function DriverServerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <DriverClientLayout>{children}</DriverClientLayout>;
}
