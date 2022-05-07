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
int ySpacing = spacing;
float ySteps; // number of lines in y direction
float lastx, lasty;

// Score values for each zone
float scoreLow = 0;
float scoreMid = 0;
float scoreHi = 0;

int xstep = 2; // stepsize (resolution) in x direction
int ystep = border; // rows

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
    float rand = map(song.mix.level(), 0, 0.4, -0.4, 0.4);

    print(song.mix.level() + ":" + calcLevel(song.mix.toArray()) + "|");

    float new_y = ySteps+rand;
    ySteps = new_y;

    if (lastx > x+border) {
      lastx= 0;
    }
    
    //draw the new line for  current song "frame"
    if (lastx > 0) {
      line(x+border, ySpacing*ySteps+border, lastx, lasty);
    }

    lastx = x+border;
    lasty = ySpacing*ySteps+border;

    if (song.isPlaying() == false) {
      saveFrame(timestamp()+"_##.png");
      stop();
      exit();
    } // stop pdf recording
  } else {
    text("No file selected!", width/2, height/2);
  }
}

void stop() {
  song.close();
  minim.stop();
  super.stop();
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
