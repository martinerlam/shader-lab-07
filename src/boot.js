import { main } from "./app.js";

const err = document.getElementById("err");
function showError(msg){
  if (!err) return;
  err.style.display = "block";
  err.textContent = "ERROR\n" + msg;
}

window.addEventListener("error", (e) => {
  showError(String(e.message || e.error || e));
});

window.addEventListener("unhandledrejection", (e) => {
  showError(String(e.reason || e));
});

try{
  const status = document.getElementById("status");
  if (status) status.textContent = "status: running";
  main();
}catch(ex){
  showError(ex && ex.stack ? ex.stack : String(ex));
}
