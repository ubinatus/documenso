import { createElement } from 'react';

import { DateTime } from 'luxon';
import { nanoid } from 'nanoid';
import { z } from 'zod';

import { mailer } from '@documenso/email/mailer';
import { render } from '@documenso/email/render';
import { ConfirmTeamEmailTemplate } from '@documenso/email/templates/confirm-team-email';
import { TEAM_MEMBER_ROLE_PERMISSIONS_MAP } from '@documenso/lib/constants/teams';
import { AppError, AppErrorCode } from '@documenso/lib/errors/app-error';
import { prisma } from '@documenso/prisma';
import { Prisma } from '@documenso/prisma/client';

import { WEBAPP_BASE_URL } from '../../constants/app';
import { FROM_ADDRESS, FROM_NAME } from '../../constants/email';

export type AddTeamEmailVerificationOptions = {
  userId: number;
  teamId: number;
  data: {
    email: string;
    name: string;
  };
};

export const addTeamEmailVerification = async ({
  userId,
  teamId,
  data,
}: AddTeamEmailVerificationOptions) => {
  try {
    await prisma.$transaction(async (tx) => {
      const team = await tx.team.findFirstOrThrow({
        where: {
          id: teamId,
          members: {
            some: {
              userId,
              role: {
                in: TEAM_MEMBER_ROLE_PERMISSIONS_MAP['MANAGE_TEAM'],
              },
            },
          },
        },
        include: {
          email: true,
          emailVerification: true,
        },
      });

      if (team.email || team.emailVerification) {
        throw new AppError(
          AppErrorCode.INVALID_REQUEST,
          'Team already has an email or existing email verification.',
        );
      }

      const existingTeamEmail = await tx.teamEmail.findFirst({
        where: {
          email: data.email,
        },
      });

      if (existingTeamEmail) {
        throw new AppError(AppErrorCode.ALREADY_EXISTS, 'Email already taken by another team.');
      }

      const token = generateTeamEmailVerificationToken();

      await tx.teamEmailVerification.create({
        data: {
          ...token,
          email: data.email,
          name: data.name,
          teamId,
        },
      });

      await sendTeamEmailVerificationEmail(data.email, token.token, team.name, team.url);
    });
  } catch (err) {
    console.error(err);

    if (!(err instanceof Prisma.PrismaClientKnownRequestError)) {
      throw err;
    }

    const target = z.array(z.string()).safeParse(err.meta?.target);

    if (err.code === 'P2002' && target.success && target.data.includes('email')) {
      throw new AppError(AppErrorCode.ALREADY_EXISTS, 'Email already taken by another team.');
    }

    throw err;
  }
};

/**
 * Send an email to a user asking them to accept a team email request.
 *
 * @param email The email address to use for the team.
 * @param token The token used to authenticate that the user has granted access.
 * @param teamName The name of the team the user is being invited to.
 * @param teamUrl The url of the team the user is being invited to.
 */
export const sendTeamEmailVerificationEmail = async (
  email: string,
  token: string,
  teamName: string,
  teamUrl: string,
) => {
  const assetBaseUrl = process.env.NEXT_PUBLIC_WEBAPP_URL || 'http://localhost:3000';

  const template = createElement(ConfirmTeamEmailTemplate, {
    assetBaseUrl,
    baseUrl: WEBAPP_BASE_URL,
    teamName,
    teamUrl,
    token,
  });

  await mailer.sendMail({
    to: email,
    from: {
      name: FROM_NAME,
      address: FROM_ADDRESS,
    },
    subject: `A request to use your email has been initiated by ${teamName} on Documenso`,
    html: render(template),
    text: render(template, { plainText: true }),
  });
};

export const generateTeamEmailVerificationToken = () => ({
  expiresAt: DateTime.now().plus({ minute: 10 }).toJSDate(),
  token: nanoid(32),
  createdAt: new Date(),
});
