const homeCanvas=document.getElementById('homeEmbers');
const homeContext=homeCanvas.getContext('2d');
let homeMotionPaused=matchMedia('(prefers-reduced-motion: reduce)').matches;
const homeParticles=Array.from({length:45},()=>({x:Math.random(),y:Math.random(),size:Math.random()*1.3+.3,speed:Math.random()*.00012+.00003}));
function resizeHomeCanvas(){homeCanvas.width=innerWidth;homeCanvas.height=innerHeight;}
resizeHomeCanvas();window.addEventListener('resize',resizeHomeCanvas);
function animateHome(){
  homeContext.clearRect(0,0,homeCanvas.width,homeCanvas.height);
  homeParticles.forEach(p=>{if(!homeMotionPaused){p.y-=p.speed;if(p.y<0)p.y=1;}homeContext.beginPath();homeContext.fillStyle='rgba(236,187,114,.4)';homeContext.arc(p.x*homeCanvas.width,p.y*homeCanvas.height,p.size,0,Math.PI*2);homeContext.fill();});
  requestAnimationFrame(animateHome);
}
animateHome();
const homeMotionButton=document.getElementById('homeMotion');
homeMotionButton.onclick=()=>{homeMotionPaused=!homeMotionPaused;homeMotionButton.setAttribute('aria-label',homeMotionPaused?'开启动效':'暂停动效');homeMotionButton.textContent=homeMotionPaused?'▷':'◉';};
const scene=document.querySelector('.memory-scene');
scene.addEventListener('pointermove',event=>{
  if(homeMotionPaused||event.pointerType==='touch')return;
  const bounds=scene.getBoundingClientRect();
  const x=(event.clientX-bounds.left)/bounds.width-.5;
  const y=(event.clientY-bounds.top)/bounds.height-.5;
  scene.querySelector('.scene-front').style.transform=`rotateY(${-9+x*9}deg) rotateX(${-y*6}deg) rotateZ(4deg)`;
  scene.querySelector('.scene-back').style.transform=`rotateY(${13+x*6}deg) rotateX(${-y*4}deg) rotateZ(-7deg)`;
});
scene.addEventListener('pointerleave',()=>{scene.querySelector('.scene-front').style.transform='';scene.querySelector('.scene-back').style.transform='';});
