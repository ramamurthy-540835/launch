import Link from "next/link";
import { notFound } from "next/navigation";
import { externalUrl, getFranchise } from "@/lib/franchises";
import FranchiseStudentRoster from "@/components/FranchiseStudentRoster";

export const dynamic = "force-dynamic";

export default async function FranchiseDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const franchise = await getFranchise(id);
  if (!franchise) notFound();
  const website = externalUrl(franchise.website);
  const mapsUrl = externalUrl(franchise.mapsUrl);
  const sourceUrl = externalUrl(franchise.sourceUrl);
  const verifiedDate = franchise.lastVerifiedAt ? new Intl.DateTimeFormat("en-IN", { dateStyle: "long" }).format(new Date(franchise.lastVerifiedAt)) : "Not provided";

  return <main className="franchise-details-page">
    <header className="topbar"><Link className="brand" href="/"><span className="brand-mark">L</span><span>Lunch<span>Box</span></span></Link><Link className="details-back" href="/#franchises">← Franchise directory</Link></header>
    <article className="franchise-details">
      <span className="kicker">{franchise.category || "CHENNAI FRANCHISE"}</span>
      <h1>{franchise.name}</h1>
      {franchise.companyName && <p className="details-company">Operated by {franchise.companyName}</p>}
      {franchise.description && <p className="details-description">{franchise.description}</p>}
      <div className="details-grid">
        <section><h2>Location</h2><address>{franchise.address}<br />{franchise.area && `${franchise.area}, `}{franchise.city || "Chennai"}</address>{mapsUrl && <a href={mapsUrl} target="_blank" rel="noreferrer">Open in Google Maps ↗</a>}</section>
        <section><h2>Contact</h2>{franchise.phone ? <a href={`tel:${franchise.phone.replace(/[^+\d]/g, "")}`}>{franchise.phone}</a> : <p>Phone not publicly listed</p>}{website && <a href={website} target="_blank" rel="noreferrer">Visit website ↗</a>}</section>
        <section><h2>Public listing</h2>{franchise.rating !== null ? <p className="details-rating">★ {franchise.rating}{franchise.reviews !== null ? ` from ${franchise.reviews} reviews` : ""}</p> : <p>Rating not publicly listed</p>}{sourceUrl && <a href={sourceUrl} target="_blank" rel="noreferrer">View source ↗</a>}</section>
        <section><h2>Verification</h2><p>Last verified: <b>{verifiedDate}</b></p></section>
      </div>
      <FranchiseStudentRoster franchiseId={franchise.id} />
    </article>
  </main>;
}
