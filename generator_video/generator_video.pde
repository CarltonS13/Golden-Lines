import com.hamoid.*;
import ddf.minim.*;
import ddf.minim.analysis.*;
import processing.pdf.*; // pdf export
import java.util.Calendar; // java calendar timestamp
import java.io.File;
Minim minim;
AudioPlayer song;
AudioMetaData meta;
FFT fft;
//line which determines if a file is selected
int selected = 0;
int written = 0;
int spacing = 16; // space between lines in pixels
int border = spacing*2; // top, left, right, bottom border
int amplification = 3; // frequency amplification factor
int y = spacing;
float ySteps; // number of lines in y direction
float lastx, lasty;


// Score values for each zone
float scoreLow = 0;
float scoreMid = 0;
float scoreHi = 0;

int xstep = 2; // stepsize (resolution) in x direction
int ystep = border; // rows

VideoExport videoExport;

String SEP = "|";
float movieFPS = 30;
float frameDuration = 1 / movieFPS;
BufferedReader reader;

String audioFilePath;

void setup() {
  selectInput("Select a file to process:", "fileSelected");
  background(255);
  textFont(createFont("Helvetica", 11)); // set up font
  textAlign(RIGHT); // align text to the right
  minim = new Minim(this);
  size(800, 800);
  strokeWeight(1);
  stroke(0);
}

// function called when file is selected.
// sets up the rest of the analysis
void fileSelected(File selection) {
  if (selection == null) {
    println("Window was closed or the user hit cancel.");
  } else {
    //since minim takes a path to a file, we
    //geth that and pass it to  minim
    audioFilePath = selection.getAbsolutePath();
    println("User selected " + audioFilePath);
    song = minim.loadFile(audioFilePath);
    meta = song.getMetaData(); // load music meta data
    // Create the FFT object to analyze the song
    //fft = new FFT(song.bufferSize(), song.sampleRate());

    // Produce the video as fast as possible
    frameRate(1000);

    // You could comment out the next line once you
    // have produced the txt file to speed up
    // experimentation. Otherwise every time you
    // run this program it re-generates the FFT
    // analysis.
    audioToTextFile(audioFilePath);
    //written = 1;

    // Now open the text file we just created for reading
    reader = createReader(audioFilePath + ".txt");

    // Set up the video exporting
    videoExport = new VideoExport(this, meta.author() + " - " + meta.title()+".mp4" );
    videoExport.setFrameRate(movieFPS);
    videoExport.setAudioFileName(audioFilePath);
    videoExport.startMovie();

    //song.play(0);
    selected = 1;
  }
}

void draw() {
  if (selected == 1 & written == 1) {
    String line;
    try {
      line = reader.readLine();
    }
    catch (IOException e) {
      e.printStackTrace();
      line = null;
    }
    if (line == null) {
      // Done reading the file.
      // Close the video file.
      videoExport.endMovie();
      saveFrame(timestamp()+"_##.png");
      deleteFile(audioFilePath);
      exit();
    } else {
      String[] p = split(line, SEP);
      // The first column indicates 
      // the sound time in seconds.
      float soundTime = float(p[0]);

      while (videoExport.getCurrentTime() <= soundTime + frameDuration * 0.5) {

        if (lastx > float(p[2])) {
          lastx= 0;
        }
        stroke(int(p[1]));
        if (lastx > 0) {
          line(float(p[2]), float(p[3]), lastx, lasty);
        }

        lastx = float(p[2]);
        lasty = float(p[3]);

        String info = songInfo();
        float textsize = textWidth(info); // get size of text length
        noStroke();
        fill(255); // draw rectangle the size of the text
        rectMode(CORNER);
        rect(width-border-textsize-spacing, height-border, textsize+border+spacing, border);
        fill(0);
        text(info, width-border, height-border/2); // print song info
        videoExport.saveFrame();
      }
    }
  } else {
    text("No file selected!", width/2, height/2);
  }
}

void stop() {
  song.close();
  minim.stop();
  super.stop();
}

void deleteFile(String fileName) {
  File f = new File(fileName + ".txt");
  if (f.exists()) {
    f.delete();
  }
}

String timestamp() {
  Calendar now = Calendar.getInstance();
  return String.format("%1$tH%1$tM%1$tS", now);
}

float level(float[] samples) {
  float level = 0;
  for (int i = 0; i < samples.length; i++)
  {
    level += (samples[i] * samples[i]);
  }
  level /= samples.length;
  level = (float) Math.sqrt(level);
  return level;
}


// Minim based audio FFT to data text file conversion.
// Non real-time, so you don't wait 5 minutes for a 5 minute song :)
// You can look at the produced txt file in the data folder
// after running this program to see how it looks like.
void audioToTextFile(String fileName) {
  PrintWriter output;

  Minim minim = new Minim(this);
  output = createWriter(fileName + ".txt");


  AudioSample track = minim.loadSample(fileName, 2048);

  int fftSize = 1024;
  float sampleRate = track.sampleRate();

  float[] fftSamples = new float[fftSize];

  float[] samples = track.getChannel(AudioSample.LEFT);

  FFT fft = new FFT(fftSize, sampleRate);

  //fftL.logAverages(22, 3);

  int totalChunks = (samples.length / fftSize) + 1;

  for (int ci = 0; ci < totalChunks; ++ci) {
    int chunkStartIndex = ci * fftSize; 
    String time = nf(chunkStartIndex/sampleRate, 0, 3).replace(',', '.');
    int chunkSize = min( samples.length - chunkStartIndex, fftSize );


    System.arraycopy( samples, chunkStartIndex, fftSamples, 0, chunkSize);
    if ( chunkSize < fftSize ) {
      java.util.Arrays.fill( fftSamples, chunkSize, fftSamples.length - 1, 0.0 );
    }

    fft.forward( fftSamples );

    int screenSize = int((width-2*border)*(height-1.5*border)/spacing);
    int x = int(map(ci, 0, totalChunks, 0, screenSize)); // current song pos
    ySteps = x/(width-2*border); // number of lines
    x -= (width-2*border)*ySteps; // new x pos in each line

    scoreLow = fft.calcAvg(20, 250);
    scoreMid = fft.calcAvg(250, 4000);
    scoreHi = fft.calcAvg(4000, 6000);

    float amplitude = level(fftSamples);
    float rand = map(amplitude, 0, 0.4, -0.4, 0.4);

    float m_x = x+border;
    float m_y = y*(ySteps+rand)+border;

    int max = 0;
    float[] freqs = {(scoreLow*0.20), (scoreMid*1.5), (scoreHi*4.00)};
    for (int i = 0; i< 3; i++) {
      if (freqs[max]<freqs[i]) {
        max = i;
      }
    }
    //orange, yellow, blue 
    int[] colors =   {color(242, 158, 76), color(239, 234, 90), color(22, 219, 147)};

    String msg = time+SEP+colors[max]+SEP+m_x+SEP+m_y;
    //print(amplitude +"|"+max+"\n");

    output.println(msg.toString());
  }

  track.close();
  output.flush();
  output.close();
  println("Sound analysis done");
  written = 1;
}

String songInfo(){
  if(meta.title() != ""){
    return meta.author() + " - " + meta.title(); // song artist and title
  }else{
    return meta.fileName();
  }
}
