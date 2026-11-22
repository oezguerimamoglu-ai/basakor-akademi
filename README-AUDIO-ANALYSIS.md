# MP3 analizi için Codespaces

Bu deneysel dal, yayımlanan `main` dalından ayrıdır. MP3 iş akışı Demucs ile dört ses gövdesi üretir; Basic Pitch bas gövdesini MIDI'ye çevirir; BeatNetLite BPM ve ölçü uzunluğu tahmini yapar; librosa eşlik gövdesinden ilk akor tahminlerini çıkarır.

## Codespace'i açma

Depodaki `mp3-analysis-codespace` dalında **Code → Codespaces** bölümünden Codespace'i açın. İlk kurulum ffmpeg, CPU PyTorch, Demucs, Basic Pitch, librosa ve sabitlenmiş BeatNetLite kaynak/model dosyalarını indirir. Mevcut Codespace'e bu dal güncellendikten sonra geçiyorsanız terminalde `git pull origin mp3-analysis-codespace` ve `bash scripts/setup-beatnetlite.sh` çalıştırın.

## Uygulama içinden MP3 denemesi

1. Codespace terminalinde `python scripts/web_server.py` çalıştırın.
2. VS Code'daki **Ports** bölümünden port **8765** için **Open in Browser** seçin. Port görünürlüğünü **Private** bırakın.
3. Açılan uygulamadaki **MP3'ten bas–akor çalışması hazırla** alanından MP3/WAV seçip **MP3'ü analiz et**'e basın. Dosya en fazla 100 MB olabilir; aynı anda bir analiz çalışır.
4. Sonuçlarda **Bas + tahmini akor çalışmasını aç** seçeneği, bas ve piano akorlarını içeren birleşik MIDI'yi mevcut MIDI çalışma bölümüne aktarır ve varsayılan olarak iki ölçü hazırlar.

Uygulama MP3'ü aynı Codespace içindeki sunucuya yükler. GitHub'a commit etmez. Uygulama sunucusundaki geçici analiz dosyaları `/tmp/basakor-akademi-mp3-jobs/` altında tutulur ve indirme bağlantıları sunucu açıkken çalışır. Codespace'te portu **Private** bırakın. GitHub Pages statik olduğundan Python analiz servisini çalıştırmaz; bu özellik bu dalın Codespace uygulamasında kullanılabilir.

## MP3 ile çalışma

Aynı MP3 akışını Codespace terminalinden çalıştırmak için:

1. VS Code Explorer'da `audio-input` klasörünü oluşturup MP3 dosyanızı buraya yükleyin.
2. Terminalde çalıştırın:

   ```bash
   python scripts/analyze_audio.py "audio-input/sarki.mp3"
   ```

3. Sonuçlar `analysis/sarki/` altında oluşur:
   - `stems/htdemucs/sarki/bass.wav`: ayrılmış bas
   - `stems/htdemucs/sarki/other.wav`: eşlik ve armonik enstrümanlar
   - `stems/htdemucs/sarki/drums.wav` ve `vocals.wav`: davul ve vokal
   - `midi/`: bas gövdesinden Basic Pitch MIDI ve yan çıktıları
   - `music-analysis.json`: BPM, tahmini ölçü ve zaman damgalı akorlar
   - `chords.csv` ve `chords.txt`: okunabilir akor özeti

Akor penceresini değiştirmek için `--chord-beats` kullanabilirsiniz; örneğin `--chord-beats 1` her vuruşta, `--chord-beats 4` dört vuruşta bir tahmin yapar. Aynı akor pencereleri birleştirilir.

## Sonuçların sınırları

BPM ve vuruş/ölçü sayısı bir model tahminidir. Model ölçüdeki vuruş sayısını tahmin eder; ekranda gösterilen payda (ör. 7/8) yaygın kullanıma göre eşlenir ve kulakla doğrulanmalıdır. Akorlar eşlik gövdesindeki kromaya göre üçlü ve yaygın yedili şablonlarıyla tahmin edilir; bunlar nota dökümü ya da doğrulanmış armoni değildir. `chords.csv` içindeki benzerlik puanı kalibre edilmiş bir olasılık değildir.

Demucs ve Basic Pitch çıktıları da otomatik transkripsiyonun kusursuz olduğu anlamına gelmez. Bas MIDI'sini dinleyip kontrol edin. Bir ölçü penceresindeki akor değişimleri kaçabilir; `--chord-beats` değerini düşürerek daha sık tahmin alabilirsiniz.

## Gizlilik ve Git

MP3 girişleri için `audio-input/`, oluşturulan sonuçlar için `analysis/` Git tarafından yok sayılır. Bu yerel dosyaları depoya commit etmeyin. Kod ve analiz betikleri deneysel dalda kalır; yayımdaki `main` dalı değişmez. BeatNetLite atfı ve lisansı için `THIRD_PARTY_NOTICES.md` dosyasına bakın.

İşlem Codespaces CPU'sunda çalışır ve özellikle ilk Demucs model indirmesinde birkaç dakika sürebilir. Kullanım bittiğinde Codespace'i durdurabilirsiniz.
