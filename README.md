# publish-edge-ext

This is a Deno script to publish a web extension for Edge.

## Prerequisites

Assuming you have already created your web extension. If not, you need to create
it first.

Log in to
<https://partner.microsoft.com/en-us/dashboard/microsoftedge/publishapi> to get
your `CLIENT_ID` and `API_KEY`.

Then navigate to the overview page of your extension, you will see `PRODUCT_ID`
at the bottom.

Create a `.env` file with the required environment variables:

```env
# Required
CLIENT_ID = 'your_client_id'
API_KEY = 'your_api_key'
PRODUCT_ID = 'your_product_id'

# Optional
NOTES = "content to be shown to the reviewers"
```

## Usage

First create a zip file of your extension. Note this is the package you are
going to submit, not your source code.

Then run the command below in the same directory as `.env`:

```bash
$ deno run -A https://raw.githubusercontent.com/violentmonkey/publish-edge-ext/main/main.ts my_extension.zip
```

## Limitation

Edge doesn't provide an API to query the status of the last submission. We will
add a new submission to the dashboard even if we upload the same version again.

As a result there is no way for us to decide whether a package has already been
submitted, so we cannot decide whether to upload the package or just wait. This
problem blocks automation. For now the only way I can think of is to run this
command once manually after a new version is released for other browsers.
