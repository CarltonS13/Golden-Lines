import ddf.minim.*;
import ddf.minim.analysis.*;
import processing.svg.*; // pdf export
import java.util.Calendar; // java calendar timestamp
import de.ixdhof.hershey.*;

Minim minim;
AudioPlayer song;
AudioMetaData meta;
FFT fft;

HersheyFont hf;

int spacing = 16; // space between lines in pixels
float border = spacing*1.5; // top, left, right, bottom border
int amplification = 3; // frequency amplification factor

float smoothing = 0.73;

String filepath;

int bpm =  120;
float beatLength = 0.5 ;

int unit = 4; //how many beats we group per line
int columns = 4; //how many columns in grid

int selected = 0;
int aggression = 2;

void setup() {
  selectInput("Select a file to process:", "fileSelected");
  background(255);
  textFont(createFont("Helvetica", 11)); // set up font
  textAlign(RIGHT); // align text to the right
  
  hf = new HersheyFont(this, "futural.jhf");
  hf.textSize(11);
  
  minim = new Minim(this);
  size(900,1200);
  pixelDensity(1);
  strokeWeight(1);
  stroke(0);
}

void draw() {

   if (selected != 1) {
         text("No file selected!", width/2, height/2);
   }else{
       noLoop();
       clear();
       beginRecord(SVG, songInfo() + "_" +timestamp() + ".svg");
       audioToArray(filepath);
       endRecord();
       exit();
   }
  }



void audioToArray(String fileName) {

  Minim minim = new Minim(this);
  
  AudioSample track = minim.loadSample(fileName);

  int fftSize = track.mix.size();
  float[] fftSamples = new float[fftSize];
  float[] samples = track.getChannel(AudioSample.LEFT);
  FFT fft = new FFT(fftSize, track.sampleRate());
  int totalChunks = (samples.length / fftSize) + 1;
  
  float lines = ((samples.length/track.sampleRate()) / (beatLength*unit));
  float xOffset = ((width - border)/columns);
  float yOffset = ((height - (3) * border)/(lines/columns));
  float len = (width-(columns*border))/columns;
   
  ArrayList<Float> beats = new ArrayList<>();
  int currIndex = 0;

  for(int chunkIdx = 0; chunkIdx < totalChunks; ++chunkIdx){
    int chunkStartIndex = chunkIdx * fftSize;
    int chunkSize = min( samples.length - chunkStartIndex, fftSize );
  
    System.arraycopy( samples,chunkStartIndex,fftSamples, 0, chunkSize );
    
    if ( chunkSize < fftSize ){
      java.util.Arrays.fill( fftSamples, chunkSize, fftSamples.length - 1, 0.0 );
    }

    fft.forward( fftSamples );
    
    beats.add(map(calcLevel(fftSamples), 0 ,0.4, -0.4, 0.4) * aggression);
    
    if(currIndex < floor((float(chunkStartIndex)/track.sampleRate())/(beatLength*unit))){
      float xPos = currIndex % columns;
      float yPos = currIndex / columns;
      drawBeat(xPos * xOffset + border , yPos * yOffset + border, len, beats.toArray(new Float[0]));
      currIndex = floor((chunkStartIndex/track.sampleRate())/(beatLength*unit));
      beats.clear();
    }
        
     }
  println("about to close track");
  
  println("lines: ", lines);
  
  String info =songInfo().toUpperCase();
  fill(0);
  //hf.text(info, int(border + 2), floor(height-border));
  track.close();
  println("Sound analysis done");
}

void drawBeat(float x, float y, float len, Float[] amps){
  
  float prevX = 0;
  float prevY = 0;
  
  for(int i =0; i < amps.length; i++){
     float nx = map(i, 0, amps.length, 0 , len);
     
     if(prevX > 0){
       line(x + nx,  y + (spacing * amps[i]), prevX, prevY);
     }

     prevX = x + nx;
     prevY =y + (spacing * amps[i]);
  }
  
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

void fileSelected(File selection) {
  if (selection == null) {
    println("Window was closed or the user hit cancel.");
  } else {
    //since minim takes a path to a file, we
    //get that and pass it to  minim
    filepath = selection.getAbsolutePath();
    println("User selected " + filepath);
    AudioPlayer song = minim.loadFile(filepath);
    meta = song.getMetaData(); // load music meta data
    println("meta.comment(): ",meta.comment());
    bpm = int(match(meta.comment(), "(?:- )(\\d*)")[1]); //get bpm from comments
    beatLength = float(60)/bpm;
    println("bpm: ",bpm);
    println("beatLength: ",beatLength);
    // Create the FFT object to analyze the song
    fft = new FFT(song.bufferSize(), song.sampleRate());
    selected = 1;
  }
}

float calcLevel(float[] samples){
    float level = 0;
    for (int i = 0; i < samples.length; i++)
    {
      level += (samples[i] * samples[i]);
    }
    level /= samples.length;
    level = (float) Math.sqrt(level);
    return level;
  }
