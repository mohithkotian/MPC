import http from 'http';

const options = {
  hostname: '::1',
  port: 3000,
  path: '/api/auth/refresh',
  method: 'POST',
};

const req = http.request(options, (res) => {
  console.log(`STATUS: ${res.statusCode}`);
  res.on('data', (d) => process.stdout.write(d));
});
req.on('error', console.error);
req.end();
