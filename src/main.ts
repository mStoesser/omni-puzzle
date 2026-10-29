import { html, render } from "lit-html";
import { de } from "./i18n/de.ts";

const app = document.getElementById("app");
if (!app) throw new Error("#app not found");

render(
  html`
    <h1>${de.appTitle}</h1>
    <p>${de.helloText}</p>
  `,
  app,
);
