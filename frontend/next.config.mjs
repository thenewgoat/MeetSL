/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      {
        source: "/ws/:path*",
        destination: "http://localhost:8000/ws/:path*",
      },
      {
        source: "/llm/:path*",
        destination: "http://localhost:8000/llm/:path*",
      },
      {
        source: "/tts",
        destination: "http://localhost:8000/tts",
      },
      {
        source: "/healthz",
        destination: "http://localhost:8000/healthz",
      },
    ];
  },
};

export default nextConfig;
