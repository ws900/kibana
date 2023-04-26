/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0 and the Server Side Public License, v 1; you may not use this file except
 * in compliance with, at your election, the Elastic License 2.0 or the Server
 * Side Public License, v 1.
 */

import { schema } from '@kbn/config-schema';
import { Logger, IRouter } from '@kbn/core/server';
import { createSession, Session } from '../lib/session';
import { startProfiling } from '../lib/cpu_profile';
import { createDeferred } from '../lib/deferred';

const routeValidation = {
  query: schema.object({
    duration: schema.number({ defaultValue: 5 }),
    // microseconds, v8 default is 1000
    interval: schema.number({ defaultValue: 1000 }),
  }),
};

const routeConfig = {
  path: '/_dev/cpu_profile',
  validate: routeValidation,
};

export function registerRoute(logger: Logger, router: IRouter): void {
  router.get(routeConfig, async (context, request, response) => {
    const { duration, interval } = request.query;

    let session: Session;
    try {
      session = await createSession(logger);
    } catch (err) {
      const message = `unable to create session: ${err.message}`;
      logger.error(message);
      return response.badRequest({ body: message });
    }

    logger.info(`starting cpu profile with duration ${duration}s, interval ${interval}μs`);
    const deferred = createDeferred();
    let stopProfiling: any;
    try {
      stopProfiling = await startProfiling(session, request.query.interval);
    } catch (err) {
      const message = `unable to start cpu profiling: ${err.message}`;
      logger.error(message);
      return response.badRequest({ body: message });
    }

    setTimeout(whenDone, 1000 * request.query.duration);

    let profile;
    async function whenDone() {
      try {
        profile = await stopProfiling();
      } catch (err) {
        logger.warn(`unable to capture cpu profile: ${err.message}`);
      }
      deferred.resolve();
    }

    await deferred.promise;

    try {
      await session.destroy();
    } catch (err) {
      logger.warn(`unable to destroy session: ${err.message}`);
    }

    if (profile == null) {
      const message = `unable to capture cpu profile`;
      logger.error(message);
      return response.badRequest({ body: message });
    }

    const fileName = new Date()
      .toISOString()
      .replace('T', '_')
      .replace(/\//g, '-')
      .replace(/:/g, '-')
      .substring(5, 19);

    return response.ok({
      body: profile,
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${fileName}.cpuprofile"`,
      },
    });
  });
}
