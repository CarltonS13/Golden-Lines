import ddf.minim.*;
import ddf.minim.analysis.*;
import processing.pdf.*; // pdf export
import java.util.Calendar; // java calendar timestamp

Minim minim;
AudioPlayer song;
AudioMetaData meta;
FFT fft;

int selected = 0;
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

// General
float smoothing = 0.73;
final boolean useDB = true;
final boolean useAWeighting = true; // only used in dB mode, because the table I found was in dB
final boolean resetBoundsAtEachStep = false;
final float maxViewportUsage = 0.85;
final int minBandwidthPerOctave = 200;
final int bandsPerOctave = 10;
final float maxCentreFrequency = 18000;
float[] fftSmooth;
int avgSize;

float minVal = 100000.0;
float maxVal = -11111110.0;
boolean firstMinDone = false;

final float[] aWeightFrequency = {
  10 , 20, 25, 31.5, 40, 50, 63, 80,
  100, 125, 160, 200, 250, 315, 400,
  500, 630, 800, 1000, 1250, 1600, 2000,
  2500, 3150, 4000, 5000, 6300, 8000, 10000,
  12500, 20000
};

final float[] aWeightDecibels = {
  -65.11, -49.51, -44.23, -39.08,-34.18,-29.96,-25.94, -22.05,
  -18.65, -15.56, -12.47, -9.86, -7.53, -5.39, -3.45,
  -2.05, -0.81, 0.11, -0.01, -2.15, -3.19, 0.04,
  2.74, 3.58, 2.43, -0.89, -6.36, -11.66, -13.16,
  -8.63, -49.51
};

float[] aWeightDBAtBandCentreFreqs;

float minAmp;

float maxAmp;


void setup() {
  selectInput("Select a file to process:", "fileSelected");
  background(255);
  textFont(createFont("Helvetica", 11)); // set up font
  textAlign(RIGHT); // align text to the right
  minim = new Minim(this);
  size(800, 800);
  pixelDensity(displayDensity());
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
    //get that and pass it to  minim
    String filepath = selection.getAbsolutePath();
    println("User selected " + filepath);
    song = minim.loadFile(filepath);
    meta = song.getMetaData(); // load music meta data
    // Create the FFT object to analyze the song
    fft = new FFT(song.bufferSize(), song.sampleRate());
    
    // Use logarithmically-spaced averaging
    fft.logAverages(minBandwidthPerOctave, bandsPerOctave);
    aWeightDBAtBandCentreFreqs = calculateAWeightingDBForFFTAverages(fft);

    avgSize = fft.avgSize();
    // Only use freqs up to maxCentreFrequency - ones above this may have
    // values too small that will skew our range calculation for all time
    while (fft.getAverageCenterFrequency(avgSize-1) > maxCentreFrequency) {
      avgSize--;
    }

    fftSmooth = new float[avgSize];
    
    audioToArray(filepath);
    
    song.play(0);
    selected = 1;
  }
}

void draw() {
  if (selected == 1) {
    // Advance the song. On draw() for each "frame" of the song ...
    fft.forward(song.mix);

    String info = songInfo();
    float textsize = textWidth(info); // get size of text length
    noStroke();
    fill(255); // draw rectangle the size of the text
    rectMode(CORNER);
    rect(width-border-textsize-spacing, height-border, textsize+border+spacing, border);
    fill(0);
    text(info, width-border, height-border/2); // print song info
    int screenSize = int((width-2*border)*(height-1.5*border)/spacing);

    int x = int(map(song.position(), 0, song.length(), 0, screenSize)); // current song pos
    ySteps = x/(width-2*border); // number of lines
    x -= (width-2*border)*ySteps; // new x pos in each line
    
    stroke(color(242, 158, 76));

    //rescale the overal amplitude from 0 to 0.4, to -0.4 to 0.4
    //float rand = map(song.mix.level(), 0, 0.4, -0.4, 0.4);

    float rand = 0;

    if (resetBoundsAtEachStep) {
      minVal = 0.0;
      maxVal = 0.0;
      firstMinDone = false;
    }

    for (int i = 0; i < avgSize; i++) {
      // Get spectrum value (using dB conversion or not, as desired)
      float fftCurr;
      if (useDB) {
        fftCurr = dB(fft.getAvg(i));
        if (useAWeighting) {
          fftCurr += aWeightDBAtBandCentreFreqs[i];
        }
      } else {
        fftCurr = fft.getAvg(i);
      }
        rand += fftCurr;
    }
    
    maxAmp = max(maxAmp, rand);
    minAmp = min(minAmp, rand);
  //    print("\n  maxAmp: " + maxAmp);
  //print("\n  minAmp: " + minAmp);
  //  print("\n  rand: " + rand);
    rand = map(rand, minAmp, maxAmp, -0.45, 0.45);
    
    


    float new_y = ySteps + rand;
    print(rand + "\n");
    ySteps = new_y;

    if (lastx > x+border) {
      lastx= 0;
    }
    
    //draw the new line for  current song "frame"
    if (lastx > 0) {
      line(x+border, y*ySteps+border, lastx, lasty);
    }

    lastx = x+border;
    lasty = y*ySteps+border;

    if (song.isPlaying() == false) {
      print("\n  maxAmp: " + maxAmp);
      print("\n  minAmp: " + minAmp);
      saveFrame(timestamp()+"_##.png");
      stop();
      exit();
    } // stop pdf recording
  } else {
    text("No file selected!", width/2, height/2);
  }
}

// Redraw function?

void stop() {
  print("\n  maxAmp: " + maxAmp);
  print("\n  minAmp: " + minAmp);
  song.close();
  minim.stop();
  super.stop();
}

String timestamp() {
  Calendar now = Calendar.getInstance();
  return String.format("%1$tH%1$tM%1$tS", now);
}

String songInfo(){
  if(meta.title() != ""){
    return meta.author() + " - " + meta.title(); // song artist and title
  }else{
    //sometimes messes up by putting full path not file name
    // so might need regex-based cleanup
    return meta.fileName();
  }
}


float[] calculateAWeightingDBForFFTAverages(FFT fft) {
  float[] result = new float[fft.avgSize()];
  for (int i = 0; i < result.length; i++) {
    result[i] = calculateAWeightingDBAtFrequency(fft.getAverageCenterFrequency(i));
  }
  return result;
}

float calculateAWeightingDBAtFrequency(float frequency) {
  return linterp(aWeightFrequency, aWeightDecibels, frequency);
}

void audioToArray(String fileName) {

  Minim minim = new Minim(this);
  
  //amplitudes = [];

  AudioSample track = minim.loadSample(fileName);

  int fftSize = song.mix.size();

  float[] fftSamples = new float[fftSize];

  float[] samples = track.getChannel(AudioSample.LEFT);

  FFT fft = new FFT(song.bufferSize(), song.sampleRate());

  int totalChunks = (samples.length / fftSize) + 1;

  for (int ci = 0; ci < totalChunks; ++ci) {
    int chunkStartIndex = ci * fftSize; 
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


    float rand = 0;

    if (resetBoundsAtEachStep) {
      minVal = 0.0;
      maxVal = 0.0;
      firstMinDone = false;
    }

    for (int i = 0; i < avgSize; i++) {
      // Get spectrum value (using dB conversion or not, as desired)
      float fftCurr;
      if (useDB) {
        fftCurr = dB(fft.getAvg(i));
        if (useAWeighting) {
          fftCurr += aWeightDBAtBandCentreFreqs[i];
        }
      } else {
        fftCurr = fft.getAvg(i);
      }
        rand += fftCurr;
    }
    
    maxAmp = max(maxAmp, rand);
    minAmp = min(minAmp, rand);

    //String msg = time+SEP+colors[max]+SEP+m_x+SEP+m_y;
    //print(amplitude +"|"+max+"\n");

  }


  print("\n  maxAmp: " + maxAmp);
  print("\n  minAmp: " + minAmp);
  track.close();
  println("Sound analysis done");
}

float dB(float x) {
  if (x == 0) {
    return 0;
  } else {
    return 10 * (float)Math.log10(x);
  }
}

float linterp(float[] x, float[] y, float xx) {
  assert(x.length > 1);
  assert(x.length == y.length);

  float result = 0.0;
  boolean found = false;

  if (x[0] > xx) {
    result = y[0];
    found = true;
  }

  if (!found) {
    for (int i = 1; i < x.length; i++) {
      if (x[i] > xx) {
        result = y[i-1] + ((xx - x[i-1]) / (x[i] - x[i-1])) * (y[i] - y[i-1]);
        found = true;
        break;
      }
    }
  }

  if (!found) {
    result = y[y.length-1];
  }

  return result;
}
