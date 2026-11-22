# 🎹 BasAkor Akademi v0.3.0

Türkçe, sıfır bağımlılıklı bir **Korg Pa4X bas–akor eğitim PWA'sı**. Sol elle bas çizgisi, sağ elle akor çalmayı öğrenmek isteyen bir org müzisyeni için geliştirildi.

## Şu anda çalışan özellikler

- **14 çalışma kalıbı:** 4/4, 6/8, 5/8, 7/8, 9/8, 12/8; farklı aksak ölçü gruplamaları; Em→Am, Em→B7 ve Am→Em.
- **MIDI şarkıdan çalışma:** `.mid` dosyasını tarayıcıda açar; ölçü, tempo, track/kanal, program ve nota aralıklarını çözümler. Bas ve akor kaynaklarını seçtirip 1/2/4 ölçülük bölümü çalışma döngüsüne dönüştürür.
- MIDI'deki kaynak kararını tahmin eder ve düzenlemene izin verir. Hedef varsayılan olarak **Mi karar**dır; bas ve akor notaları aynı aralıkla taşınır, dosyanın majör/minör ilişkisi korunur, davul kanalı transpoze edilmez.
- Etkin piyano kanalı yoksa çok sesli bir armoni kanalı (ör. gitar veya yaylılar) akor kaynağı olarak önerilir; akor çalışması mevcut e-piyano tonlarıyla sunulur.
- **Seviye ve kalıp seçimi:** Başlangıç, ritim kalıpları, akor geçişleri veya tüm kalıplar; ilk açılışta 14 kalıbın tamamı seçilebilir.
- Sekizlik bas yürüyüşleri, oktav içi hareketler ve akor geçişlerinde kök/beşinci/geçiş sesleriyle ölçü içinde daha hareketli sol el çizgileri.
- Metronom/davul sesi (Web Audio sentezi) ve 45–160 BPM, dokunarak tempo belirleme.
- **İki gerçek bas gitar tonu:** Yamaha RBX parmak bası ve penayla bas. Bas sesleri CC0 1.0 lisanslı FreePats / Andrea Biasior kayıtlarından gelir; örnekler mobil Safari için WAV biçimine dönüştürülüp uygulamayla birlikte sunulur.
- **İki e-piyano tonu:** DX7 tarzı klasik ve parlak FM e-piyano örnekleri. Akorlar seçilen CC0 örneklerinden çalar; sesler FreePats için Hexter yazılım sentezleyicisinden kaydedilmiştir.
- Akıllı 8 ölçülük alıştırma, bas–akor adımı görselleştirme, sesli örnek isteğe bağlı.
- Sol el bası ve sağ el akoru ayrı gösteren ekran tuşları; sağ el akorları E4 ve üzeri register'dadır.
- Doğru nota, akor bileşenleri, erken/geç vuruş geri bildirimi.
- **Web MIDI giriş desteği:** Cihaz/kanal seçimi, MIDI nota ve 190 ms'lik akor gruplaması, en yüksek nota filtresi. Clock mesajları her MIDI girişinden dinlenir; nota verileri yalnızca seçili girişten alınır.
- Deneysel **harici MIDI Clock modu**: Pa4X kendi davulunu çalarken `START` ve `F8` darbelerini takip eder; uygulama davulu sessiz kalır. **Fiziksel cihazla doğrulanmadı**.
- Her dersin en iyi yüzdesi ve tamamlanan alıştırma sayısı tarayıcının yerel hafızasında saklanır.
- PWA manifest, çevrimdışı önbellekleme, iPhone/Windows uyumlu responsive arayüz.
- Sunucu bağlantısına, ödeme hesabına veya bulut veritabanına ihtiyaç duymaz.
- MIDI dosyası seçildikten sonra yalnızca bu cihazın tarayıcısında işlenir; dosya sunucuya gönderilmez.

## Windows'ta kullanmak

1. ZIP'i tamamen çıkart.
2. Bilgisayarında [Python](https://www.python.org/downloads/) varsa **`start-windows.bat`** dosyasını çift tıkla.
3. `http://localhost:8765` sayfasını Chrome/Edge'de aç. `start-windows.bat` zaten tarayıcıyı açmaya çalışır.
4. İlk ders `Mi minör · İlk adım` ve 65 BPM'de **Başlat**. Ekrandaki Mi/Em/Si/Em tuşlarına davul eşliğinde dokun.
5. Daha sonra Pa4X'in **USB DEVICE** (USB-B) portunu Windows'a bağla ve uygulamada **MIDI bağlantısını aç**.

Alternatif: Komut satırından bu klasörde `python -m http.server 8765`. Başka bir uygulama port 8765'i kullanıyorsa `python -m http.server 8766` ve `http://localhost:8766` adresini kullan.

**Tek dosya demo:** `basakor-akademi-demo.html`, Python olmadan tarayıcıda açmak için ayrıca hazırlanır. Uygulamanın çok dosyalı PWA sürümündeki çevrimdışı yükleme ve Web MIDI izinleri için HTTPS/localhost daha güvenilirdir.

## Pa4X'in kendi davuluyla çalışma (deneysel)

1. Pa4X'i USB DEVICE üzerinden Windows'a bağla.
2. Gerekli olursa KORG USB-MIDI Driver kur: https://www.korg.com/us/support/download/product/0/516/
3. Pa4X: `Global > MIDI > General Controls`, **Clock Source = Internal**, **Clock Send = On**. Korg kılavuzu bu seçeneğin cihaz her açıldığında kapandığını belirtir.
4. Chrome/Edge'de uygulamayı `https://...` veya `http://localhost:8765` üzerinden aç, **MIDI bağlantısını aç**. Mümkünse nota girişi için adı `Pa4X KEYBOARD` olan MIDI input'u seç. Uygulama MIDI Clock'u ayrıca tüm mevcut girişlerde dinler. `Pa4X SOUND` gibi diğer girişlerde eşlik partilerinin notaları da bulunabilir.
5. **Davul kaynağı → Pa4X davulu · MIDI Clock**, ardından uygulamada **Başlat**.
6. Pa4X'in STYLE PLAY ritmini başlat. Pa4X `START (FA)`, `Clock (F8)` ve `STOP (FC)` mesajları gönderirse uygulama bunları takip eder.
7. **MIDI Clock sayacı ilerlemiyorsa** MIDI ayarlarını/giriş portunu kontrol et. Clock sinyali gelmiyorsa uygulamada **Uygulama davulu** moduna geri dön.
8. Akor algılanmıyorsa Pa4X'in MIDI OUT/USB portundan klavye notalarının gönderildiğini kontrol et; `MIDI giriş cihazı`, `Giriş kanalı`, `En yüksek nota` filtrelerini değiştir.

**Önemli:** MIDI Clock üzerinden otomatik vuruş eşzamanlaması henüz bir Pa4X'e bağlanarak denenmedi. Cihazın port yönlendirmesi, tuş gönderimi, latency ve Clock Start davranışı gerçek donanımda kalibre edilmeli. Uygulama MIDI verisini yalnızca **okur**; Pa4X'e nota, program değişimi veya MIDI komutu göndermez. Bu nedenle Pa4X ayarlarını uygulama değiştiremez.

## iPhone'da kullanmak

Dosyaları örneğin **GitHub Pages** ile HTTPS üzerinde yayımla. Safari üzerinden siteyi aç, paylaş menüsünden **Ana Ekrana Ekle**.

iPhone'da sanal tuşlar, sesler, dersler ve ilerleme kaydı kullanılabilir. **iOS Safari'de yerleşik Web MIDI bulunmadığı için** gerçek Pa4X klavyesini bu tarayıcıdan doğrudan okuyamazsın. MIDI değerlendirmesi için Windows Chrome/Edge önerilir.

GitHub Pages yükleme: GitHub hesabında yeni bir `basakor-akademi` repository oluştur, bu klasördeki dosyaları kök dizine yükle, **Settings → Pages → Deploy from a branch → main / (root)** seç. Ücretsiz public repo GitHub Pages ile yayımlanabilir. GitHub Pages linkinin aktif olması biraz sürebilir; uygulama içinde harici API anahtarı yoktur.

## Davul ve tempo notları

- 4/4'te tempo birimi **dörtlük**, 9/8–7/8–5/8'de görsel adım **sekizlik**tir; BPM yine dörtlük darbe hızına göre hesaplanır.
- 9/8, 7/8, 5/8 şablonları **pedagojik alıştırmalar**dır; belirli bir bölgenin gerçek ritmini tam temsil ettikleri iddia edilmez.
- Akor tanıma eşzamanlı gelen notaları 190 ms'lik bir pencereye toplar; bu profesyonel müzik çözümleyici değildir.
- Örnek Em (Mi–Sol–Si) **Mi kararın tamamı** demek değildir. Makam, koma ve yöresel armoni desteği şu sürümde bulunmaz.
- Pa4X hoparlöründen çalan davul sesi uygulamanın kendi sesine karıştırılmamalıdır: Clock modunda uygulama davul çalmaz.

## Teknik

Sıfır üçüncü taraf bağımlılık. HTML/CSS/JavaScript (ES modules), Web Audio, Web MIDI, Service Worker, localStorage. MIDI çözümleme `midi-file.mjs` içindedir; nota/timing testleri `tests.test.mjs`, arayüz smoke testleri `tests-ui.test.mjs` dosyalarındadır.

Test: **`node --test tests.test.mjs`** (Node.js 18+).

## Ses örneklerinin kaynağı

Bas gitar kayıtları Andrea Biasior tarafından Yamaha RBX ile kaydedilmiş ve FreePats'e CC0 1.0 (kamu malı adaması) ile sunulmuştur. Kaynak: [FreePats Clean Electric Bass](https://freepats.zenvoid.org/ElectricGuitar/clean-electric-bass.html) · [kaynak depo ve lisans](https://github.com/freepats/electric-bass-YR).

E-piyano örnekleri Roberto tarafından FreePats için Hexter FM synthesizer ile üretilmiş; Yamaha DX7 e-piyano tarzı klasik ve parlak tonları taklit eder. CC0 1.0 lisanslıdır: [FreePats Synthesized Piano](https://freepats.zenvoid.org/ElectricPiano/synthesized-piano.html) · [FM Piano 1](https://github.com/freepats/fm-piano1) · [FM Piano 2](https://github.com/freepats/fm-piano2). Uygulamadaki kısa WAV örnekleri, kaynak seslerin dönüştürülmüş ve yeniden örneklenmiş sürümleridir.

Güvenlik: Dış sunucuya müzik, MIDI veya kişisel veri gönderilmez. MIDI yalnızca izin verildiğinde okunur. Diğer web uygulamalarının MIDI erişim izinleri ayrı olabilir.

## Bilinen sınırlamalar ve sonraki geliştirme

- Gerçek Pa4X ile entegre test, MIDI kanalı algılama rehberi, ölçü başı Clock senkronizasyonu/latency kalibrasyonu.
- MIDI ton tahmini armoni sezgiseldir; düşük güvenli tahminleri kullanıcı doğrulamalıdır. Etkin piyano kanalı yoksa armoni kaynağı olarak başka bir çok sesli kanal seçilmelidir.
- Tempo haritası analiz edilir; oluşturulan bölüm şu sürümde seçilen ölçünün başlangıç temposunda sabit çalar. Ölçü işareti değişen MIDI dosyaları analiz edilir ancak çalışma hazırlama devre dışı kalır.
- Gerçek Türk usullerine özgü davul örnekleri, akor ters çevrimlerini düzenleme ve dışa aktarılabilir transpoze MIDI.
- Puanlama, ekran/cihaz gecikmesine duyarlı bir **alıştırma göstergesidir**, laboratuvar hassasiyetinde ölçüm değildir.
- MIDI Clock modu bazı ritim başlangıç/pause davranışlarında cihazdan gelen farklı mesajlara göre kalibre edilmelidir.
- Mevcut tarayıcı verisini temizlersen yerel rekorlar silinebilir.
