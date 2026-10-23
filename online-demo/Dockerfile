FROM python:3.12-slim

WORKDIR /app
COPY dist/ /app/

ENV PYTHONDONTWRITEBYTECODE=1
EXPOSE 8080
USER 65532:65532

CMD ["sh", "-c", "exec python -m http.server \"${PORT:-8080}\" --bind 0.0.0.0 --directory /app"]
