/**
 * Supertest opens a new TCP connection for every request and Windows holds each
 * closed socket in TIME_WAIT for minutes, so a full e2e run burns through the
 * ephemeral port range and dies with ENOBUFS in whichever suite happens to be
 * running at the time. Superagent issues its requests through Node's global
 * agent, so pooling connections there keeps the socket count flat for every
 * spec without each one having to opt in.
 */
import http from "http";

http.globalAgent = new http.Agent({ keepAlive: true, maxSockets: 16, timeout: 4000 });
