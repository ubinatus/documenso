import React from 'react';

import { redirect } from 'next/navigation';

import { getServerSession } from 'next-auth';

import { LimitsProvider } from '@documenso/ee/server-only/limits/provider/server';
import { NEXT_AUTH_OPTIONS } from '@documenso/lib/next-auth/auth-options';
import { getRequiredServerComponentSession } from '@documenso/lib/next-auth/get-server-session';
import { getTeams } from '@documenso/lib/server-only/team/get-teams';

import { Header } from '~/components/(dashboard)/layout/header';
import { RefreshOnFocus } from '~/components/(dashboard)/refresh-on-focus/refresh-on-focus';
import { NextAuthProvider } from '~/providers/next-auth';

export type AuthenticatedDashboardLayoutProps = {
  children: React.ReactNode;
};

export default async function AuthenticatedTeamsDashboardLayout({
  children,
}: AuthenticatedDashboardLayoutProps) {
  const session = await getServerSession(NEXT_AUTH_OPTIONS);

  if (!session) {
    redirect('/signin');
  }

  const [{ user }, teams] = await Promise.all([
    getRequiredServerComponentSession(),
    getTeams({ userId: session.user.id }),
  ]);

  return (
    <NextAuthProvider session={session}>
      <LimitsProvider>
        <Header user={user} teams={teams} />

        <main className="mt-8 pb-8 md:mt-12 md:pb-12">{children}</main>

        <RefreshOnFocus />
      </LimitsProvider>
    </NextAuthProvider>
  );
}
