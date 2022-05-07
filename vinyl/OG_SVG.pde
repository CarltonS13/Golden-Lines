import processing.svg.*;
import ddf.minim.*;
import ddf.minim.analysis.*;
import java.util.Calendar; // java calendar timestamp
import de.ixdhof.hershey.*;

Minim minim;
//AudioPlayer song;
AudioMetaData meta;
FFT fft;

HersheyFont hf;

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

String filepath;


void setup() {
  selectInput("Select a file to process:", "fileSelected");
  //background(255);
  textFont(createFont("Helvetica", 11)); // set up font
  textAlign(RIGHT); // align text to the right
  
  hf = new HersheyFont(this, "futural.jhf");
  hf.textSize(11);
  
  minim = new Minim(this);
  size(600,800);
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
  
  // Exit the program
}

void audioToArray(String fileName) {

  Minim minim = new Minim(this);
  
  AudioSample track = minim.loadSample(fileName);

  int fftSize = track.mix.size();
  //int fftSize = 1024;

  float[] fftSamples = new float[fftSize];

  float[] samples = track.getChannel(AudioSample.LEFT);

  FFT fft = new FFT(fftSize, track.sampleRate());

  int totalChunks = (samples.length / fftSize) + 1;

  for(int chunkIdx = 0; chunkIdx < totalChunks; ++chunkIdx)
  {
    int chunkStartIndex = chunkIdx * fftSize;
   
    // the chunk size will always be fftSize, except for the 
    // last chunk, which will be however many samples are left in source
    int chunkSize = min( samples.length - chunkStartIndex, fftSize );
   
    // copy first chunk into our analysis array
    System.arraycopy( samples, // source of the copy
               chunkStartIndex, // index to start in the source
               fftSamples, // destination of the copy
               0, // index to copy to
               chunkSize // how many samples to copy
              );
      
    // if the chunk was smaller than the fftSize, we need to pad the analysis buffer with zeroes        
    if ( chunkSize < fftSize )
    {
      // we use a system call for this
      java.util.Arrays.fill( fftSamples, chunkSize, fftSamples.length - 1, 0.0 );
    }

    fft.forward( fftSamples );
    
    int screenSize = int((width-2*border)*(height-1.5*border)/spacing);

    int x = int(map(chunkIdx, 0, totalChunks, 0, screenSize)); // current song pos
    ySteps = x/(width-2*border); // number of lines
    x -= (width-2*border)*ySteps; // new x pos in each line
    
    //average amplitude at different frequency ranges
    scoreLow = fft.calcAvg(20, 250); //low frequencies;bass and sub bass
    scoreMid = fft.calcAvg(250, 4000);//midrange
    scoreHi = fft.calcAvg(4000, 6000);// highs excluding the highest possible frequencies

    //since higher frequencies are percieved as louder to the human ear 
    //and that lower freqencies tend to have a large amplitude 
    //we compensate by multiplying the averages by different factors 
    float[] freqs = {(scoreLow*0.20), (scoreMid*1.5), (scoreHi*4.00)};
    
    //find most prominent frequency 
    int max = 0;
    for (int i = 0; i< 3; i++) {
      if (freqs[max]<freqs[i]) {
        max = i;
      }
    }
    
    //orange, yellow, blue 
    //  #860bb7 , #b7860b, #0bb786 
    int[] colors = {color(242, 158, 76), color(239, 234, 90), color(22, 219, 147)}; //orginial
    //int[] colors = {color(134, 11, 183), color(184, 134, 11), color(94, 183, 134)}; //accesible
    stroke(colors[max]);

    //rescale the overal amplitude from 0 to 0.4, to -0.4 to 0.4
    float rand = map(calcLevel(fftSamples), 0, 0.4, -0.4, 0.4);
    //print(rand + ",");

    float new_y = ySteps+rand;
    ySteps = new_y;

    if (lastx > x+border) {
      lastx= 0;
    }
    
    //draw the new line for  current song "frame"
    if (lastx > 0) {
      line(x+border, y*ySteps+border, lastx, lasty);
      //println(x+border, y*ySteps+border, lastx, lasty);
    }
    
    lastx = x+border;
    lasty = y*ySteps+border;

    
  }
  print("about to close track");
  
  String info =songInfo().toUpperCase();
  fill(0);
  hf.text(info, border + 2, floor(height-border/2));
  track.close();
  println("Sound analysis done");
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
