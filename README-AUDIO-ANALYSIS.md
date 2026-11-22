# MP3 analizi için Codespaces

Bu deneysel dal, BasAkor Akademi uygulamasının yayımlanan `main` dalından ayrı bir Python çalışma alanı kurar. Codespace; Demucs ile bas kanalını ayırır, ardından Basic Pitch ile bu kanaldan MIDI notaları üretir. Bu çıktı otomatik olarak kusursuz bir bas transkripsiyonu anlamına gelmez; sonucu dinleyip düzenlemek gerekir.

## Codespace'i açma

Depodaki `mp3-analysis-codespace` dalında **Code → Codespaces → Create codespace on mp3-analysis-codespace** seçin. Codespace oluşturulurken iki çekirdekli bir makine yeterli bir başlangıçtır. İlk kurulum ffmpeg, CPU sürümü PyTorch, Demucs ve Basic Pitch'i indirir; ilk ses ayırma çalıştırması ayrıca Demucs model ağırlıklarını indirir.

## MP3 ile çalışma

1. VS Code Explorer'da `audio-input` klasörünü oluşturun ve MP3 dosyanızı buraya yükleyin.
2. Terminalde çalıştırın:

   ```bash
   python scripts/analyze_audio.py "audio-input/sarki.mp3"
   ```

3. Sonuçlar `analysis/sarki/` altında oluşur:
   - `stems/htdemucs/sarki/bass.wav`: Demucs'un ayırdığı bas kanalı
   - `midi/`: Basic Pitch'in ürettiği MIDI ve ek dosyalar

Dosya adında boşluk veya Türkçe karakter varsa tırnakları koruyun. İşlem Codespaces'in CPU'sunda çalıştığı için 4–5 dakikalık bir şarkının ayrıştırılması birkaç dakika veya daha uzun sürebilir.

## Gizlilik ve Git

MP3'ler için `audio-input/`, üretilen dosyalar için `analysis/` Git tarafından yok sayılır. Bu yerel dosyaları depoya commit etmeyin. Codespace'i kullandıktan sonra GitHub Codespaces menüsünden durdurabilirsiniz.
