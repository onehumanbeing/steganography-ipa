"use client"
import { useState, useRef, useEffect } from "react"
import { useDynamicContext } from "@dynamic-labs/sdk-react-core"
import { useNotification } from "@/context/notificationContext"
import { StoryClient, StoryConfig } from "@story-protocol/core-sdk"
import { Address, http } from "viem"
import { isEthereumWallet } from "@dynamic-labs/ethereum"
import { uploadJSONToIPFS } from "@/library/story/utils/uploadToIpfs"
import { createHash } from "crypto"
import DynamicConnectButton from "@/components/DynamicModal/walletWidget"
import { CurrencyAddress } from "@/library/story/utils/utils"
import { PIL_TYPE } from "@story-protocol/core-sdk"
import "./globals.css"

interface ImageHistory {
    imageData: string;
    timestamp: number;
    txHash?: string;
    signature?: string;
    ipId?: `0x${string}`;
    parentId?: `0x${string}`; // Added parentId field
}

const CameraPage = () => {
    const videoRef = useRef<HTMLVideoElement>(null)
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const fileInputRef = useRef<HTMLInputElement>(null)
    const [imageData, setImageData] = useState<string | null>(null)
    const [currentSignature, setCurrentSignature] = useState<string | null>(null)
    const [loading, setLoading] = useState(false)
    const [imageHistory, setImageHistory] = useState<ImageHistory[]>([])
    const [selectedParentImage, setSelectedParentImage] = useState<ImageHistory | null>(null)
    const { primaryWallet } = useDynamicContext()
    const { addNotification } = useNotification()

    useEffect(() => {
        const savedHistory = localStorage.getItem('imageHistory')
        if (savedHistory) {
            try {
                const parsedHistory = JSON.parse(savedHistory)
                setImageHistory(parsedHistory)
            } catch (error) {
                console.error("Error parsing image history:", error)
                localStorage.removeItem('imageHistory')
                addNotification("Error loading history", "error")
            }
        }
    }, [addNotification])

    // Add watermark and steganography to image
    const addWatermarkAndSteganography = (imageData: string): Promise<string> => {
        return new Promise((resolve) => {
            const img = new Image()
            img.src = imageData
            img.onload = () => {
                const canvas = document.createElement('canvas')
                canvas.width = img.width
                canvas.height = img.height
                const ctx = canvas.getContext('2d')
                if (ctx) {
                    // Draw original image
                    ctx.drawImage(img, 0, 0)
                    
                    // Add watermark text
                    const watermarkText = '@Story Protocol'
                    ctx.font = `${Math.floor(img.width * 0.03)}px Arial`
                    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)'
                    
                    // Get text metrics
                    const metrics = ctx.measureText(watermarkText)
                    const padding = 20
                    
                    // Draw semi-transparent background for watermark
                    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)'
                    ctx.fillRect(
                        img.width - metrics.width - padding * 2,
                        img.height - parseInt(ctx.font) - padding * 2,
                        metrics.width + padding * 2,
                        parseInt(ctx.font) + padding * 2
                    )
                    
                    // Draw watermark text
                    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)'
                    ctx.fillText(
                        watermarkText,
                        img.width - metrics.width - padding,
                        img.height - padding
                    )

                    // Add steganography - hide timestamp in least significant bits
                    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
                    const timestamp = Date.now().toString()
                    const binaryTimestamp = timestamp.split('').map(char => 
                        char.charCodeAt(0).toString(2).padStart(8, '0')
                    ).join('')

                    for (let i = 0; i < binaryTimestamp.length; i++) {
                        const bit = parseInt(binaryTimestamp[i])
                        // Modify least significant bit of red channel
                        imageData.data[i * 4] = (imageData.data[i * 4] & 0xFE) | bit
                    }

                    ctx.putImageData(imageData, 0, 0)
                }
                resolve(canvas.toDataURL('image/png'))
            }
        })
    }

    // Start camera
    const startCamera = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ 
                video: true 
            })
            if (videoRef.current) {
                videoRef.current.srcObject = stream
                addNotification("Camera started successfully", "success")
            }
        } catch (err) {
            console.error("Error accessing camera:", err)
            addNotification("Failed to access camera", "error")
        }
    }

    // Take photo
    const takePhoto = async () => {
        if (videoRef.current && canvasRef.current) {
            const context = canvasRef.current.getContext('2d')
            if (context) {
                canvasRef.current.width = videoRef.current.videoWidth
                canvasRef.current.height = videoRef.current.videoHeight
                context.drawImage(videoRef.current, 0, 0)
                // Generate base64 image data
                const photo = canvasRef.current.toDataURL('image/png')
                const processedPhoto = await addWatermarkAndSteganography(photo)
                setImageData(processedPhoto)
                console.log("New photo captured:", processedPhoto)
                addNotification("Photo captured successfully", "success")
            }
        }
    }

    // Handle local image upload
    const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0]
        if (file) {
            const reader = new FileReader()
            reader.onloadend = async () => {
                const processedImage = await addWatermarkAndSteganography(reader.result as string)
                setImageData(processedImage)
                console.log("New image uploaded:", processedImage)
                addNotification("Image uploaded successfully", "success")
            }
            reader.readAsDataURL(file)
        }
    }

    const registerIPA = async () => {
        if (!imageData || !primaryWallet || !isEthereumWallet(primaryWallet)) {
            addNotification("Please take a photo or upload an image and connect wallet first", "error")
            return
        }

        setLoading(true)
        try {
            const walletClient = await primaryWallet.getWalletClient()
            const config: StoryConfig = {
                wallet: walletClient,
                transport: http(process.env.RPC_PROVIDER_URL),
                chainId: "iliad",
            }
            const client = StoryClient.newClient(config)

            const ipMetadata = client.ipAsset.generateIpMetadata({
                title: selectedParentImage ? "Derivative Camera Photo IP" : "Camera Photo IP",
                description: selectedParentImage ? "Derivative photo from parent photo" : "Photo taken with camera and signed",
                watermarkImg: imageData,
                attributes: [
                    {
                        key: "Author",
                        value: primaryWallet.address,
                    }
                ],
            })

            const nftMetadata = {
                name: selectedParentImage ? "Derivative Camera Photo NFT" : "Camera Photo NFT",
                description: selectedParentImage ? "Derivative NFT from parent photo" : "NFT representing the camera photo",
                image: imageData,
            }

            const ipIpfsHash = await uploadJSONToIPFS(ipMetadata)
            const ipHash = createHash("sha256").update(ipIpfsHash).digest("hex")
            const nftIpfsHash = await uploadJSONToIPFS(nftMetadata)
            const nftHash = createHash("sha256").update(nftIpfsHash).digest("hex")

            let response;
            if (selectedParentImage && selectedParentImage.ipId) {
                response = await client.ipAsset.mintAndRegisterIpAndMakeDerivative({
                    nftContract: "0x57b8e223Cd397B8334ff37a2FA0F513DdB57E498" as Address,
                    derivData: {
                        parentIpIds: [selectedParentImage.ipId],
                        licenseTermsIds: ["161"],
                    },
                    ipMetadata: {
                        ipMetadataURI: `https://ipfs.io/ipfs/${ipIpfsHash}`,
                        ipMetadataHash: `0x${ipHash}`,
                        nftMetadataURI: `https://ipfs.io/ipfs/${nftIpfsHash}`,
                        nftMetadataHash: `0x${nftHash}`,
                    },
                    txOptions: { waitForTransaction: true },
                })
            } else {
                response = await client.ipAsset.mintAndRegisterIpAssetWithPilTerms({
                    nftContract: "0x57b8e223Cd397B8334ff37a2FA0F513DdB57E498" as Address,
                    pilType: PIL_TYPE.COMMERCIAL_REMIX,
                    mintingFee: 1,
                    currency: CurrencyAddress,
                    commercialRevShare: 5,
                    ipMetadata: {
                        ipMetadataURI: `https://ipfs.io/ipfs/${ipIpfsHash}`,
                        ipMetadataHash: `0x${ipHash}`,
                        nftMetadataURI: `https://ipfs.io/ipfs/${nftIpfsHash}`,
                        nftMetadataHash: `0x${nftHash}`,
                    },
                    txOptions: { waitForTransaction: true },
                })
            }

            const newHistory = [...imageHistory, {
                imageData: imageData,
                timestamp: Date.now(),
                txHash: response.txHash,
                ipId: response.ipId as `0x${string}`,
                parentId: selectedParentImage?.ipId // Add parent ID if it exists
            }]
            setImageHistory(newHistory)
            localStorage.setItem('imageHistory', JSON.stringify(newHistory))

            addNotification(
                `Photo ${selectedParentImage ? 'derivative' : ''} IPA registered successfully! TX: ${response.txHash}`,
                "success"
            )
            setSelectedParentImage(null)
        } catch (error) {
            console.error("Error registering IPA:", error)
            addNotification("Failed to register IPA", "error")
        } finally {
            setLoading(false)
        }
    }

    const clearHistory = () => {
        setImageHistory([])
        localStorage.removeItem('imageHistory')
        addNotification("History cleared successfully", "success")
    }

    return (
        <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white">
            <div className="bg-white shadow-md">
                <div className="container mx-auto px-4 py-3 flex justify-between items-center">
                    <h1 className="text-2xl font-bold text-blue-600">
                        Image Steganography
                    </h1>
                    <DynamicConnectButton />
                </div>
            </div>
            
            <div className="container mx-auto px-4 py-8">
                <div className="max-w-4xl mx-auto bg-white rounded-lg shadow-lg p-8">
                    <h2 className="text-3xl font-bold text-center text-blue-600 mb-8">
                        Camera Photo IPA
                    </h2>
                    
                    {selectedParentImage && (
                        <div className="mb-4 p-4 bg-blue-50 rounded-lg">
                            <p className="text-sm text-blue-600">Creating derivative from selected image</p>
                            <button 
                                onClick={() => setSelectedParentImage(null)}
                                className="text-sm text-red-500 hover:text-red-600"
                            >
                                Cancel
                            </button>
                        </div>
                    )}

                    <div className="flex gap-4 justify-center mb-8">
                        <button 
                            onClick={startCamera}
                            className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
                        >
                            Start Camera
                        </button>

                        <button 
                            onClick={() => fileInputRef.current?.click()}
                            className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
                        >
                            Upload Image
                        </button>
                        <input 
                            type="file"
                            ref={fileInputRef}
                            onChange={handleFileUpload}
                            accept="image/*"
                            className="hidden"
                        />
                    </div>

                    <div className="rounded-lg overflow-hidden shadow-md mb-8">
                        <video 
                            ref={videoRef}
                            autoPlay 
                            playsInline
                            className="w-full"
                        />
                        <canvas 
                            ref={canvasRef} 
                            className="hidden"
                        />
                    </div>

                    <div className="flex gap-4 justify-center">
                        <button 
                            onClick={takePhoto}
                            className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
                        >
                            Take Photo
                        </button>

                        <button 
                            onClick={registerIPA}
                            disabled={!imageData || loading}
                            className={`px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors
                                ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                            {loading ? (
                                <span className="flex items-center">
                                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                    Registering...
                                </span>
                            ) : 'Register as IPA'}
                        </button>
                    </div>

                    {imageData && (
                        <div className="mt-8 bg-gray-50 rounded-lg p-6">
                            <h3 className="text-xl font-semibold text-blue-600 mb-4">Preview:</h3>
                            <div className="rounded-lg overflow-hidden shadow-md">
                                <img 
                                    src={imageData} 
                                    alt="Captured" 
                                    className="w-full"
                                />
                            </div>
                        </div>
                    )}

                    {/* Notification Toast */}
                    <div className="fixed bottom-4 right-4 z-50">
                        <div id="notification-toast" className="bg-white rounded-lg shadow-lg p-4 mb-4 transform transition-transform duration-300 translate-y-0">
                            <div className="flex items-center">
                                <div className="flex-shrink-0">
                                    <svg className="h-6 w-6 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                </div>
                                <div className="ml-3">
                                    <p className="text-sm font-medium text-gray-900">
                                        Success!
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {imageHistory.length > 0 && (
                        <div className="mt-8">
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="text-xl font-semibold text-blue-600">History:</h3>
                                <button 
                                    onClick={clearHistory}
                                    className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
                                >
                                    Clear History
                                </button>
                            </div>
                            <div className="grid grid-cols-1 gap-4">
                                {imageHistory.map((item, index) => (
                                    <div key={index} className="bg-gray-50 rounded-lg p-4">
                                        <div className="flex flex-col md:flex-row gap-4">
                                            <div className="w-full md:w-1/3">
                                                <img 
                                                    src={item.imageData} 
                                                    alt={`History ${index + 1}`} 
                                                    className="w-full h-auto rounded-lg shadow-md"
                                                />
                                                <button
                                                    onClick={() => setSelectedParentImage(item)}
                                                    className="mt-2 w-full px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
                                                >
                                                    Use as Parent
                                                </button>
                                            </div>
                                            <div className="w-full md:w-2/3">
                                                <p className="text-sm text-gray-600 mb-2">
                                                    Created: {new Date(item.timestamp).toLocaleString()}
                                                </p>
                                                {item.txHash && (
                                                    <p className="text-sm text-gray-600 break-all">
                                                        <span className="font-medium">TX:</span> {item.txHash}
                                                    </p>
                                                )}
                                                {item.ipId && (
                                                    <p className="text-sm text-gray-600 break-all">
                                                        <span className="font-medium">IP ID:</span> {item.ipId}
                                                    </p>
                                                )}
                                                {item.parentId && (
                                                    <p className="text-sm text-gray-600 break-all">
                                                        <span className="font-medium">Parent IP ID:</span> {item.parentId}
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}

export default CameraPage