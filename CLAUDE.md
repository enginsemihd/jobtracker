# JobTrack — Claude Code için proje notları

Bu, kişisel bir iş başvurusu takip uygulamasıdır. AI ile özgeçmiş/ön yazı uyarlama (Claude) ve çok kaynaklı iş arama (Jooble, Adzuna, Remotive, RemoteOK, Arbeitnow, Jobicy, Reed, Himalayas, Findwork) içerir. Avrupa + Türkiye + UK pazarına odaklıdır. Çoklu kullanıcı destekli (JWT auth, her kullanıcı kendi profili/başvuruları).

## Mimari (pnpm monorepo)
- `artifacts/job-tracker` — React + Vite + Tailwind v4 (ön yüz, port 5173)
- `artifacts/api-server` — Express 5 API (arka uç, port 8080, `/api` altında)
- `lib/db` — PostgreSQL / Drizzle ORM (Supabase ile çalışır)
- `lib/api-zod` — istek doğrulayıcıları (zod)
- `lib/api-client-react` — React Query hook'ları
- `lib/api-spec/openapi.yaml` — tüm tiplerin kaynağı (endpoint sözleşmesi)

## Sık kullanılan komutlar
- `pnpm install` — bağımlılıkları kur
- `pnpm db:push` — şemayı veritabanına uygula (Supabase'de tablo oluşturur)
- `pnpm dev` — API + ön yüzü birlikte çalıştır (uygulama: http://localhost:5173)
- `pnpm dev:api` / `pnpm dev:web` — ayrı ayrı çalıştır
- `pnpm typecheck` — tüm paketleri tip kontrolünden geçir
- `pnpm build` — ön yüz prod derlemesi

## Çalışma kuralları (lütfen uy)
- Değişiklikten sonra `pnpm typecheck` çalıştır; hata varsa düzelt.
- API uç noktası eklerken/değiştirirken önce `lib/api-spec/openapi.yaml`'ı güncelle, sonra `lib/api-zod` ve `lib/api-client-react`'i ona göre güncelle.
- `.env` dosyasını ASLA commit etme, içeriğini gösterme, API anahtarlarını koda gömme. Anahtarlar yalnızca `.env` içinde durur.
- Veritabanını etkileyen komutları (`db:push` vb.) çalıştırmadan önce bana kısaca ne yapacağını söyle.
- İş arama kaynakları yalnızca resmi API'lerle çalışır; hiçbir siteyi scrape etme (Kariyer.net/Yenibiris dahil). Türkiye kapsamı Jooble üzerinden gelir.
- Büyük değişikliklerden önce `git add -A && git commit` ile kayıt al ki geri alınabilsin.

## Ortam değişkenleri (.env)
DATABASE_URL, PORT (8080), JWT_SECRET, ANTHROPIC_API_KEY, JOOBLE_API_KEY, (opsiyonel) ADZUNA_APP_ID/ADZUNA_APP_KEY, (opsiyonel) REED_API_KEY, (opsiyonel) FINDWORK_API_KEY, (opsiyonel) GOOGLE_CLIENT_ID + VITE_GOOGLE_CLIENT_ID (Google ile giriş). Himalayas anahtarsız/keyless.
